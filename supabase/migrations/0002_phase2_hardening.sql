-- ============================================================================
-- Station House Fire Sheet V2 — Phase 2 Hardening
-- Migration: 0002_phase2_hardening.sql
--
-- Builds on 0001_phase1_foundation.sql. Delivers the hardening 0001 deferred:
--   1. create_order()      — transactional order RPC; server-side prices/tax
--   2. orders status guard — role-aware transition rules + undo, DB-enforced
--   3. kitchen masking     — kitchen loses ALL base-table access to orders /
--                            order_items; reads flow through money-free views
--                            (kitchen_orders_v, kitchen_order_items_v) and
--                            status writes flow through kitchen_orders_v only
--   4. status audit trail  — every status change appends an audit_log row
--
-- Money math (matches seed convention): 7.5% sales tax, rounded HALF-UP to
-- the nearest cent using pure integer arithmetic:
--   tax_cents = (subtotal_cents * 750 + 5000) / 10000   (integer division)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. is_service_context() — true only for the service-role / webhook path
-- ----------------------------------------------------------------------------
-- Deliberately NOT security definer: it must observe the *session's*
-- current_user (a definer function would always see the function owner).
-- auth.uid() is null when there is no JWT (service key, migrations, seeds).
create or replace function public.is_service_context()
returns boolean
language sql
stable
as $$
  select auth.uid() is null
     and current_user in ('postgres', 'service_role');
$$;

comment on function public.is_service_context() is
  'True when running without a user JWT as postgres/service_role (webhooks, seeds, migrations). Used to skip staff-role enforcement in triggers.';

-- ----------------------------------------------------------------------------
-- 2. create_order() — the one sanctioned way to create an order
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER with a pinned search_path. A plpgsql function body already
-- executes as a single transaction (any raised exception rolls back every
-- write made inside it), so customer + order + items + audit are all-or-nothing.
--
-- Behavior:
--   * caller must be an active staff member (current_staff_role() not null)
--   * p_tip_cents  : integer >= 0
--   * p_items      : non-empty json array of {product_id uuid, quantity int>0}
--   * p_customer   : {full_name (required), phone, email}; find-or-create,
--                    matched by lower(email) first, then phone, else insert
--   * products must exist AND be active; rows locked FOR SHARE so prices
--     cannot change underneath the order; prices come from the DB ONLY
--     (client-supplied prices are ignored — none are even accepted)
--   * tax = 7.5% of subtotal, rounded half-up; total = subtotal + tax + tip
--   * order lands as status 'confirmed' / payment_status 'unpaid';
--     order_number is filled by trg_orders_fill_order_number
--   * appends an audit_log row (action 'order.create')
--   * returns the full order row as jsonb plus an 'items' array
create or replace function public.create_order(
  p_customer      jsonb,
  p_order_type    public.order_type,
  p_pickup_day    date,
  p_pickup_window text,
  p_items         jsonb,
  p_tip_cents     integer default 0,
  p_notes         text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full_name   text;
  v_phone       text;
  v_email       text;
  v_customer_id uuid;
  v_line        record;
  v_pid         uuid;
  v_qty         integer;
  v_product     public.products%rowtype;
  v_lines       jsonb  := '[]'::jsonb;
  v_subtotal    bigint := 0;
  v_tax         bigint;
  v_total       bigint;
  v_order       public.orders%rowtype;
  v_items_out   jsonb;
begin
  -- caller must be an active staff member
  if public.current_staff_role() is null then
    raise exception 'create_order: caller is not an active staff member';
  end if;

  -- tip must be a non-negative integer
  if p_tip_cents is null or p_tip_cents < 0 then
    raise exception 'create_order: p_tip_cents must be an integer >= 0';
  end if;

  -- items must be a non-empty json array
  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'create_order: p_items must be a non-empty json array of {product_id, quantity}';
  end if;

  -- customer: find-or-create
  if p_customer is null or jsonb_typeof(p_customer) <> 'object' then
    raise exception 'create_order: p_customer must be a json object {full_name, phone, email}';
  end if;

  v_full_name := nullif(btrim(coalesce(p_customer->>'full_name', '')), '');
  v_phone     := nullif(btrim(coalesce(p_customer->>'phone',     '')), '');
  v_email     := nullif(btrim(coalesce(p_customer->>'email',     '')), '');

  if v_full_name is null then
    raise exception 'create_order: customer full_name is required';
  end if;

  if v_email is not null then
    select c.id into v_customer_id
    from public.customers c
    where lower(c.email) = lower(v_email)
    order by c.created_at
    limit 1;
  end if;

  if v_customer_id is null and v_phone is not null then
    select c.id into v_customer_id
    from public.customers c
    where c.phone = v_phone
    order by c.created_at
    limit 1;
  end if;

  if v_customer_id is null then
    -- mirrors customers_contact_required with a friendlier message
    if v_phone is null and v_email is null then
      raise exception 'create_order: customer needs at least a phone or an email';
    end if;
    insert into public.customers (full_name, phone, email)
    values (v_full_name, v_phone, v_email)
    returning id into v_customer_id;
  end if;

  -- validate every item, lock the product rows, price from the DB only
  for v_line in
    select value as item, ordinality as idx
    from jsonb_array_elements(p_items) with ordinality
  loop
    if jsonb_typeof(v_line.item) <> 'object' then
      raise exception 'create_order: item #% must be an object {product_id, quantity}', v_line.idx;
    end if;

    begin
      v_pid := nullif(v_line.item->>'product_id', '')::uuid;
    exception
      when invalid_text_representation then
        raise exception 'create_order: item #% has an invalid product_id', v_line.idx;
    end;
    if v_pid is null then
      raise exception 'create_order: item #% is missing product_id', v_line.idx;
    end if;

    if coalesce(v_line.item->>'quantity', '') !~ '^[0-9]+$' then
      raise exception 'create_order: item #% quantity must be a positive integer', v_line.idx;
    end if;
    v_qty := (v_line.item->>'quantity')::integer;
    if v_qty <= 0 then
      raise exception 'create_order: item #% quantity must be > 0', v_line.idx;
    end if;

    -- FOR SHARE: block concurrent price/active changes until we commit
    select p.* into v_product
    from public.products p
    where p.id = v_pid
    for share;

    if not found then
      raise exception 'create_order: product % does not exist', v_pid;
    end if;
    if not v_product.active then
      raise exception 'create_order: product % (%) is not active', v_product.sku, v_pid;
    end if;

    v_subtotal := v_subtotal + v_product.price_cents::bigint * v_qty;
    v_lines := v_lines || jsonb_build_object(
      'product_id',            v_product.id,
      'product_name_snapshot', v_product.name,
      'unit_price_cents',      v_product.price_cents,
      'quantity',              v_qty,
      'line_total_cents',      v_product.price_cents * v_qty
    );
  end loop;

  -- money: 7.5% tax, integer round-half-up; total = subtotal + tax + tip
  v_tax   := (v_subtotal * 750 + 5000) / 10000;
  v_total := v_subtotal + v_tax + p_tip_cents;
  if v_total > 2147483647 then
    raise exception 'create_order: order total exceeds the supported maximum';
  end if;

  -- order row; order_number filled by trg_orders_fill_order_number
  insert into public.orders
    (customer_id, order_type, pickup_day, pickup_window,
     status, payment_status,
     subtotal_cents, tax_cents, tip_cents, total_cents, notes)
  values
    (v_customer_id, p_order_type, p_pickup_day, p_pickup_window,
     'confirmed', 'unpaid',
     v_subtotal::integer, v_tax::integer, p_tip_cents, v_total::integer, p_notes)
  returning * into v_order;

  -- item snapshots (name + unit price frozen at order time)
  insert into public.order_items
    (order_id, product_id, product_name_snapshot, unit_price_cents, quantity, line_total_cents)
  select
    v_order.id,
    (l->>'product_id')::uuid,
    l->>'product_name_snapshot',
    (l->>'unit_price_cents')::integer,
    (l->>'quantity')::integer,
    (l->>'line_total_cents')::integer
  from jsonb_array_elements(v_lines) as l;

  -- audit trail
  insert into public.audit_log
    (actor_user_id, entity_type, entity_id, action, before_data, after_data)
  values
    (auth.uid(), 'order', v_order.id::text, 'order.create', null, to_jsonb(v_order));

  -- result: full order row + items
  select coalesce(jsonb_agg(to_jsonb(oi) order by oi.created_at, oi.id), '[]'::jsonb)
  into v_items_out
  from public.order_items oi
  where oi.order_id = v_order.id;

  return to_jsonb(v_order) || jsonb_build_object('items', v_items_out);
end;
$$;

revoke execute on function
  public.create_order(jsonb, public.order_type, date, text, jsonb, integer, text)
  from public, anon;
grant execute on function
  public.create_order(jsonb, public.order_type, date, text, jsonb, integer, text)
  to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Status-transition guard + status audit (spec items 2 and 4)
-- ----------------------------------------------------------------------------
-- Invoker-rights on purpose: current_user must reflect the session so
-- is_service_context() works; current_staff_role() is already a definer
-- function, so the role lookup works regardless.
--
-- Rules by current_staff_role():
--   owner / manager : any transition
--   counter         : (confirmed|in_production|ready) -> (ready|picked_up)
--                     plus picked_up -> ready              (undo)
--   kitchen         : (pending|confirmed) -> in_production,
--                     in_production -> ready,
--                     ready -> in_production               (undo)
--   catering        : any transition, but ONLY on order_type = 'catering'
--   marketing / null: rejected
--   service context : enforcement skipped (no JWT + postgres/service_role)
--
-- Every real status change (any path, service context included) appends an
-- audit_log row: action 'order.status', before/after status.
create or replace function public.orders_status_guard()
returns trigger
language plpgsql
as $$
declare
  v_role    public.staff_role;
  v_allowed boolean := false;
begin
  -- fires on UPDATE ... SET status, even when the value did not change
  if new.status is not distinct from old.status then
    return new;
  end if;

  if public.is_service_context() then
    v_allowed := true;
  else
    v_role := public.current_staff_role();

    if v_role in ('owner', 'manager') then
      v_allowed := true;

    elsif v_role = 'counter' then
      v_allowed :=
           (old.status in ('confirmed', 'in_production', 'ready')
              and new.status in ('ready', 'picked_up'))
        or (old.status = 'picked_up' and new.status = 'ready');   -- undo

    elsif v_role = 'kitchen' then
      v_allowed :=
           (old.status in ('pending', 'confirmed') and new.status = 'in_production')
        or (old.status = 'in_production'           and new.status = 'ready')
        or (old.status = 'ready'                   and new.status = 'in_production'); -- undo

    elsif v_role = 'catering' then
      v_allowed := (old.order_type = 'catering' and new.order_type = 'catering');

    else
      -- marketing, or no active staff profile
      v_allowed := false;
    end if;
  end if;

  if not v_allowed then
    raise exception
      'order % status transition "%" -> "%" is not allowed for role "%"',
      old.order_number, old.status, new.status, coalesce(v_role::text, 'none')
      using errcode = '42501';
  end if;

  -- undo-friendly audit trail for EVERY status change
  insert into public.audit_log
    (actor_user_id, entity_type, entity_id, action, before_data, after_data)
  values
    (auth.uid(), 'order', new.id::text, 'order.status',
     jsonb_build_object('status', old.status),
     jsonb_build_object('status', new.status));

  return new;
end;
$$;

create trigger trg_orders_status_guard
  before update of status on public.orders
  for each row execute function public.orders_status_guard();

-- ----------------------------------------------------------------------------
-- 4. Kitchen money masking (spec item 3)
-- ----------------------------------------------------------------------------
-- Phase 1 left kitchen with base-table SELECT (money visible) and an
-- unrestricted-column UPDATE policy, with a written promise that Phase 2
-- would land column-level masking. This is that hardening:
--
--   * orders_kitchen_select      DROPPED — kitchen reads orders only via view
--   * orders_kitchen_update      DROPPED — kitchen writes only via the view's
--                                 status column (see grant below); this is the
--                                 "status only" column restriction 0001 said
--                                 policies could not express
--   * order_items_kitchen_select DROPPED — order_items carries money too
--
-- The views are recreated WITHOUT security_invoker (owner-based, i.e.
-- SECURITY DEFINER-style): the querying user's RLS on the base tables no
-- longer applies, so kitchen needs no base-table policy at all. Access is
-- gated inside the view body via current_staff_role().

drop policy orders_kitchen_select      on public.orders;
drop policy orders_kitchen_update      on public.orders;
drop policy order_items_kitchen_select on public.order_items;

-- Recreate the production view owner-based (drop first: CREATE OR REPLACE
-- would keep the old security_invoker reloption).
drop view public.kitchen_orders_v;

create view public.kitchen_orders_v as
select
  o.id,
  o.order_number,
  o.order_type,
  o.pickup_day,
  o.pickup_window,
  o.status,
  o.notes
from public.orders o
where public.current_staff_role() in ('kitchen', 'owner', 'manager');

comment on view public.kitchen_orders_v is
  'Production view of orders with NO money columns. Owner-based (not security_invoker); access gated in the view body by current_staff_role(). Kitchen''s only read AND write (status column) path to orders.';

-- Same treatment for order items: no unit/line price columns.
create view public.kitchen_order_items_v as
select
  oi.id,
  oi.order_id,
  oi.product_id,
  oi.product_name_snapshot,
  oi.quantity,
  oi.notes
from public.order_items oi
where public.current_staff_role() in ('kitchen', 'owner', 'manager');

comment on view public.kitchen_order_items_v is
  'Production view of order_items with NO money columns. Owner-based; access gated in the view body by current_staff_role(). Kitchen''s only read path to order_items.';

revoke all on public.kitchen_orders_v      from public, anon;
revoke all on public.kitchen_order_items_v from public, anon;

grant select on public.kitchen_orders_v      to authenticated;
grant select on public.kitchen_order_items_v to authenticated;

-- kitchen status updates flow through the view: the view is auto-updatable,
-- the grant is column-scoped to status, the base table is reached as the view
-- owner (so no base-table policy is needed), the view body's role check keeps
-- other roles out, and trg_orders_status_guard enforces the transition rules.
grant update (status) on public.kitchen_orders_v to authenticated;
