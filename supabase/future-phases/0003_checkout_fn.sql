-- Station House Fire Sheet V2 — transactional checkout (docs/ARCHITECTURE.md §6–§7).
--
-- checkout_fire_drop(attempt_id, square_payment_id, skip_window) is the ONLY
-- write path for public preorders. The create-checkout Edge Function does thin
-- validation + Square orchestration and calls this via the service role; the
-- square-webhook Edge Function calls it again (skip_window := true) as the
-- exactly-once recovery path when a browser died between payment and order.
--
-- Guarantees:
--   * Everything happens in one transaction (plpgsql function body).
--   * Product caps and slot capacity are enforced under `for update` row
--     locks, so concurrent checkouts cannot oversell (§7).
--   * All prices/tax recomputed from fire_drop_products / menu_items — the
--     cart snapshot's item list only carries ids + qty; client totals are
--     never trusted (§6.1). Totals must equal what was charged.
--   * Idempotent per attempt: preorders.checkout_attempt_id is UNIQUE, and an
--     existing preorder for the attempt is returned as-is (§6.6).

create or replace function checkout_fire_drop(
  p_attempt_id uuid,
  p_square_payment_id text,
  p_skip_window boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare
  v_attempt   checkout_attempts%rowtype;
  v_existing  preorders%rowtype;
  v_cart      jsonb;
  v_channel   preorder_channel;
  v_day       text;
  v_slot      fire_drop_slots%rowtype;
  v_drop      fire_drops%rowtype;
  v_prod      fire_drop_products%rowtype;
  v_menu      menu_items%rowtype;
  v_item      jsonb;
  v_qty       int;
  v_subtotal  bigint := 0;
  v_tax       bigint;
  v_total     bigint;
  v_lines     jsonb := '[]'::jsonb;
  v_line      jsonb;
  v_ref       text;
  v_preorder  preorders%rowtype;
  v_pickup_date   date;
  v_pickup_window text;
  v_now_et    timestamp;
  v_wm        int;      -- minutes since Monday 00:00 ET
  c_thu_5pm   constant int := 3 * 1440 + 17 * 60;  -- Thu 17:00
  c_thu_2pm   constant int := 3 * 1440 + 14 * 60;  -- Thu 14:00 (Cuban cutoff)
  c_fri_3pm   constant int := 4 * 1440 + 15 * 60;  -- Fri 15:00
begin
  -- Lock the attempt row: serializes duplicate calls (edge fn + webhook retry).
  select * into v_attempt from checkout_attempts where id = p_attempt_id for update;
  if not found then
    raise exception 'checkout attempt % not found', p_attempt_id using errcode = 'P0002';
  end if;

  -- Exactly-once: if this attempt already produced a preorder, return it.
  select * into v_existing from preorders where checkout_attempt_id = p_attempt_id;
  if found then
    return jsonb_build_object(
      'order_ref', v_existing.order_ref, 'total_cents', v_existing.total_cents,
      'pickup_date', v_existing.pickup_date, 'pickup_window', v_existing.pickup_window,
      'already_existed', true);
  end if;

  v_cart := v_attempt.cart;
  v_channel := (v_cart->>'channel')::preorder_channel;
  v_day := coalesce(v_cart->>'day', 'friday');
  if jsonb_array_length(coalesce(v_cart->'items', '[]'::jsonb)) = 0 then
    raise exception 'cart is empty' using errcode = 'P0001';
  end if;

  -- ET ordering windows (§7), re-enforced in SQL. Recovery skips this check:
  -- the customer already paid inside the window.
  v_now_et := now() at time zone 'America/New_York';
  v_wm := (extract(isodow from v_now_et)::int - 1) * 1440
        + extract(hour from v_now_et)::int * 60
        + extract(minute from v_now_et)::int;
  if not p_skip_window then
    if v_channel = 'fire_drop' and v_day = 'friday' and v_wm >= c_thu_5pm then
      raise exception 'Friday pickup ordering closed Thursday at 5:00 PM ET.' using errcode = 'P0001';
    elsif v_channel = 'fire_drop' and v_day = 'saturday' and (v_wm < c_thu_5pm or v_wm >= c_fri_3pm) then
      raise exception 'Saturday ordering is open Thu 5:00 PM - Fri 3:00 PM ET only.' using errcode = 'P0001';
    elsif v_channel = 'cuban_thursday' and v_wm >= c_thu_2pm then
      raise exception 'Cuban Thursday ordering closed (Thu 2:00 PM ET).' using errcode = 'P0001';
    end if;
  end if;

  if v_channel = 'fire_drop' then
    -- Current drop: newest window. Lock it so admin sold-out flips serialize.
    select * into v_drop from fire_drops order by friday_date desc limit 1 for update;
    if not found then
      raise exception 'no active fire drop' using errcode = 'P0001';
    end if;
    if v_drop.sold_out then
      raise exception 'This week''s Fire Drop is sold out.' using errcode = 'P0001';
    end if;
    v_pickup_date := case when v_day = 'saturday' then v_drop.saturday_date else v_drop.friday_date end;

    -- Slot capacity under lock (§7: `select … for update`).
    if v_cart->>'slot_id' is null then
      raise exception 'Choose a pickup window' using errcode = 'P0001';
    end if;
    select * into v_slot from fire_drop_slots
      where id = (v_cart->>'slot_id')::bigint and drop_id = v_drop.id and day = v_day::drop_day
      for update;
    if not found then
      raise exception 'Pickup window not found for that day' using errcode = 'P0001';
    end if;
    if v_slot.booked >= v_slot.capacity then
      raise exception 'That pickup window is full - choose another.' using errcode = 'P0001';
    end if;
    v_pickup_window := v_slot.pickup_window;

    -- Price each line from fire_drop_products; enforce caps + 86 under lock.
    -- Deterministic lock order (by product id) avoids deadlocks.
    for v_item in
      select value from jsonb_array_elements(v_cart->'items')
      order by (value->>'product_id')::bigint
    loop
      v_qty := (v_item->>'qty')::int;
      if v_qty is null or v_qty < 1 then
        raise exception 'invalid quantity' using errcode = 'P0001';
      end if;
      select * into v_prod from fire_drop_products
        where id = (v_item->>'product_id')::bigint and drop_id = v_drop.id
        for update;
      if not found then
        raise exception 'Product not found' using errcode = 'P0001';
      end if;
      if v_prod.sold_out then
        raise exception '% is sold out (86''d).', v_prod.name using errcode = 'P0001';
      end if;
      if v_prod.cap_qty is not null and v_prod.sold_qty + v_qty > v_prod.cap_qty then
        raise exception 'Only % left of %.', greatest(0, v_prod.cap_qty - v_prod.sold_qty), v_prod.name
          using errcode = 'P0001';
      end if;
      v_subtotal := v_subtotal + v_prod.price_cents * v_qty;
      v_lines := v_lines || jsonb_build_object(
        'fire_drop_product_id', v_prod.id, 'menu_item_id', v_prod.menu_item_id,
        'name', v_prod.name, 'qty', v_qty, 'unit_price_cents', v_prod.price_cents);

      update fire_drop_products
        set sold_qty = sold_qty + v_qty,
            sold_out = (cap_qty is not null and sold_qty + v_qty >= cap_qty)
        where id = v_prod.id;
    end loop;

    update fire_drop_slots set booked = booked + 1 where id = v_slot.id;

  else
    -- Cuban Thursday: pickup is always the coming Thursday (ET week), fixed window.
    v_pickup_date := date_trunc('week', v_now_et)::date + 3;
    v_pickup_window := '11AM-2PM';
    for v_item in select value from jsonb_array_elements(v_cart->'items')
    loop
      v_qty := (v_item->>'qty')::int;
      if v_qty is null or v_qty < 1 then
        raise exception 'invalid quantity' using errcode = 'P0001';
      end if;
      select * into v_menu from menu_items
        where id = (v_item->>'product_id')::bigint
        for update;
      if not found then
        raise exception 'Menu item not found' using errcode = 'P0001';
      end if;
      if not v_menu.active then
        raise exception '% is not available.', v_menu.name using errcode = 'P0001';
      end if;
      if not v_menu.thursday_only then
        raise exception '% is not part of Cuban Thursday.', v_menu.name using errcode = 'P0001';
      end if;
      v_subtotal := v_subtotal + v_menu.price_cents * v_qty;
      v_lines := v_lines || jsonb_build_object(
        'fire_drop_product_id', null, 'menu_item_id', v_menu.id,
        'name', v_menu.name, 'qty', v_qty, 'unit_price_cents', v_menu.price_cents);
    end loop;
  end if;

  -- 7.5% tax, round half up (matches lib/money.ts: floor(s*750/10000 + 0.5)).
  v_tax := (v_subtotal * 750 + 5000) / 10000;
  v_total := v_subtotal + v_tax;

  -- The charged amount was computed from the same catalog by the Edge
  -- Function before payment; a mismatch means prices moved mid-checkout.
  if v_total <> v_attempt.total_cents then
    raise exception 'total mismatch: computed % vs charged %', v_total, v_attempt.total_cents
      using errcode = 'P0001';
  end if;

  -- Immutable public reference: FD/CT + pickup date + random suffix.
  v_ref := case when v_channel = 'fire_drop' then 'FD-' else 'CT-' end
        || to_char(v_pickup_date, 'MMDD') || '-'
        || upper(substr(md5(gen_random_uuid()::text), 1, 4));

  insert into preorders (
    order_ref, checkout_attempt_id, channel, customer_name, phone, email,
    pickup_date, pickup_window, slot_id,
    subtotal_cents, tax_cents, total_cents, status, square_payment_id,
    utm_source, utm_medium, utm_campaign, utm_term, utm_content,
    gclid, fbclid, referrer, landing_page)
  values (
    v_ref, p_attempt_id, v_channel,
    coalesce(v_attempt.contact_snapshot->>'name', v_cart->'customer'->>'name', ''),
    coalesce(v_attempt.contact_snapshot->>'phone', v_cart->'customer'->>'phone', ''),
    coalesce(v_attempt.contact_snapshot->>'email', v_cart->'customer'->>'email', ''),
    v_pickup_date, v_pickup_window,
    case when v_channel = 'fire_drop' then v_slot.id else null end,
    v_subtotal, v_tax, v_total, 'paid', p_square_payment_id,
    v_attempt.attribution->>'utm_source', v_attempt.attribution->>'utm_medium',
    v_attempt.attribution->>'utm_campaign', v_attempt.attribution->>'utm_term',
    v_attempt.attribution->>'utm_content', v_attempt.attribution->>'gclid',
    v_attempt.attribution->>'fbclid', v_attempt.attribution->>'referrer',
    v_attempt.attribution->>'landing_page')
  returning * into v_preorder;

  for v_line in select value from jsonb_array_elements(v_lines)
  loop
    insert into preorder_items (
      preorder_id, fire_drop_product_id, menu_item_id, name_snapshot,
      unit_price_cents, qty, line_total_cents)
    values (
      v_preorder.id,
      nullif(v_line->>'fire_drop_product_id', '')::bigint,
      nullif(v_line->>'menu_item_id', '')::bigint,
      v_line->>'name',
      (v_line->>'unit_price_cents')::bigint,
      (v_line->>'qty')::int,
      (v_line->>'unit_price_cents')::bigint * (v_line->>'qty')::int);
  end loop;

  insert into preorder_status_history (preorder_id, from_status, to_status, actor_label)
  values (v_preorder.id, null, 'pending', 'public-checkout'),
         (v_preorder.id, 'pending', 'paid', case when p_skip_window then 'square-webhook' else 'public-checkout' end);

  update checkout_attempts
    set status = case when p_skip_window then 'recovered' else 'completed' end,
        square_payment_id = coalesce(square_payment_id, p_square_payment_id)
    where id = p_attempt_id;

  insert into audit_log (actor, action, entity, entity_id, before, after)
  values (null, 'checkout.completed', 'preorders', v_preorder.id::text, null,
          jsonb_build_object('order_ref', v_ref, 'total_cents', v_total,
                             'attempt_id', p_attempt_id, 'recovered', p_skip_window));

  insert into notifications_outbox (event, payload)
  values ('order.created', jsonb_build_object(
    'order_ref', v_ref, 'channel', v_channel, 'customer', v_preorder.customer_name,
    'pickup_date', v_pickup_date, 'pickup_window', v_pickup_window,
    'total_cents', v_total));

  return jsonb_build_object(
    'order_ref', v_ref, 'total_cents', v_total,
    'pickup_date', v_pickup_date, 'pickup_window', v_pickup_window,
    'already_existed', false);
end
$$;

-- Callable ONLY via the Edge Functions' service-role client. Anonymous and
-- authenticated app users never execute this directly.
revoke all on function checkout_fire_drop(uuid, text, boolean) from public;
revoke all on function checkout_fire_drop(uuid, text, boolean) from anon;
revoke all on function checkout_fire_drop(uuid, text, boolean) from authenticated;
grant execute on function checkout_fire_drop(uuid, text, boolean) to service_role;

-- Public order tracking by immutable ref: minimal fields, no direct table read.
create or replace function track_preorder(p_ref text) returns jsonb
language sql stable security definer set search_path = public as
$$
  select jsonb_build_object(
    'order_ref', p.order_ref, 'channel', p.channel, 'status', p.status,
    'pickup_date', p.pickup_date, 'pickup_window', p.pickup_window,
    'total_cents', p.total_cents,
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
                'name', i.name_snapshot, 'qty', i.qty)), '[]'::jsonb)
              from preorder_items i where i.preorder_id = p.id))
  from preorders p
  where lower(p.order_ref) = lower(trim(p_ref)) and not p.hidden
$$;
grant execute on function track_preorder(text) to anon, authenticated, service_role;
