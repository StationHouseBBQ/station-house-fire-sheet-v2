-- Station House Fire Sheet V2 — core schema (identity, crm, catalog, orders, prep, fire drop, infra)
-- Conventions: bigint identity PKs, uuid public tokens, money = integer cents,
-- timestamptz everywhere, business time computed in America/New_York.
-- RLS: deny-by-default; policies per role (docs/ARCHITECTURE.md §5).

-- ── Roles ────────────────────────────────────────────────────────────────
create type app_role as enum ('owner_admin','catering_director','kitchen','counter_foh','packing');
create type order_status as enum ('draft','pending_payment','paid','confirmed','in_prep','ready','picked_up','delivered','cancelled','refunded');
create type prep_status as enum ('not_started','in_progress','complete');
create type lead_stage as enum ('new','contacted','needs_quote','quote_sent','booked','follow_up','lost');

-- ── Identity ─────────────────────────────────────────────────────────────
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table locations (
  id bigint generated always as identity primary key,
  name text not null,
  timezone text not null default 'America/New_York'
);
create table user_roles (
  user_id uuid not null references profiles(id) on delete cascade,
  role app_role not null,
  location_id bigint references locations(id),
  primary key (user_id, role)
);
create or replace function has_role(r app_role) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from user_roles where user_id = auth.uid() and role = r) $$;
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select has_role('owner_admin') $$;

-- ── CRM ──────────────────────────────────────────────────────────────────
create table companies (
  id bigint generated always as identity primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id)
);
create table contacts (
  id bigint generated always as identity primary key,
  company_id bigint references companies(id),
  first_name text, last_name text,
  email text, phone text,
  email_consent boolean not null default false,
  sms_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id)
);
create table leads (
  id bigint generated always as identity primary key,
  public_token uuid not null default gen_random_uuid() unique,
  contact_id bigint references contacts(id),
  stage lead_stage not null default 'new',
  event_type text, guest_count int, event_date date,
  budget_cents bigint, notes text,
  -- native attribution (no GoHighLevel)
  utm_source text, utm_medium text, utm_campaign text, utm_term text, utm_content text,
  gclid text, fbclid text, referrer text, landing_page text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id)
);
create table lead_stage_history (
  id bigint generated always as identity primary key,
  lead_id bigint not null references leads(id) on delete cascade,
  from_stage lead_stage, to_stage lead_stage not null,
  actor uuid references profiles(id),
  at timestamptz not null default now()
);
create table activities (
  id bigint generated always as identity primary key,
  entity text not null, entity_id bigint not null,
  kind text not null, body text,
  actor uuid references profiles(id),
  at timestamptz not null default now()
);

-- ── Catalog ──────────────────────────────────────────────────────────────
create table menu_categories (
  id bigint generated always as identity primary key,
  name text not null,
  sort_order int not null default 0,
  active boolean not null default true
);
create table menu_items (
  id bigint generated always as identity primary key,
  category_id bigint references menu_categories(id),
  name text not null,
  description text,
  price_cents bigint not null check (price_cents >= 0),
  active boolean not null default true,
  sort_order int not null default 0,
  -- menu truths: thursday_only enforces Cubans / Smash Burgers service model
  thursday_only boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table menu_variants (
  id bigint generated always as identity primary key,
  item_id bigint not null references menu_items(id) on delete cascade,
  name text not null,
  price_delta_cents bigint not null default 0,
  sort_order int not null default 0,
  active boolean not null default true
);

-- ── Orders ───────────────────────────────────────────────────────────────
create table pickup_slots (
  id bigint generated always as identity primary key,
  slot_date date not null,
  slot_start time not null,
  slot_end time not null,
  capacity int not null check (capacity >= 0),
  booked int not null default 0 check (booked >= 0),
  open_at timestamptz not null,
  close_at timestamptz not null,
  unique (slot_date, slot_start)
);
create table checkout_attempts (
  id uuid primary key default gen_random_uuid(),
  cart jsonb not null,
  subtotal_cents bigint not null,
  tax_cents bigint not null,
  total_cents bigint not null,
  contact_snapshot jsonb,
  attribution jsonb,
  square_payment_id text,
  status text not null default 'created', -- created | payment_pending | completed | recovered | abandoned
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table orders (
  id bigint generated always as identity primary key,
  order_ref text not null unique,          -- immutable public reference
  public_token uuid not null default gen_random_uuid() unique,
  checkout_attempt_id uuid references checkout_attempts(id),
  contact_id bigint references contacts(id),
  status order_status not null default 'draft',
  channel text not null,                    -- fire_drop | cuban_thursday | catering | retail | shop …
  pickup_slot_id bigint references pickup_slots(id),
  subtotal_cents bigint not null check (subtotal_cents >= 0),
  tax_cents bigint not null check (tax_cents >= 0),
  total_cents bigint not null check (total_cents >= 0),
  utm_source text, utm_medium text, utm_campaign text, utm_term text, utm_content text,
  gclid text, fbclid text, referrer text, landing_page text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id)
);
create table order_items (
  id bigint generated always as identity primary key,
  order_id bigint not null references orders(id) on delete cascade,
  menu_item_id bigint references menu_items(id),
  name_snapshot text not null,
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  qty int not null check (qty > 0),
  line_total_cents bigint not null check (line_total_cents >= 0)
);
create table order_status_history (
  id bigint generated always as identity primary key,
  order_id bigint not null references orders(id) on delete cascade,
  from_status order_status, to_status order_status not null,
  actor uuid references profiles(id),
  at timestamptz not null default now()
);
create table payments (
  id bigint generated always as identity primary key,
  order_id bigint not null references orders(id),
  square_payment_id text unique,
  amount_cents bigint not null,
  currency text not null default 'USD',
  status text not null,
  verified_at timestamptz,                 -- set only after server-side Square verification
  created_at timestamptz not null default now()
);
create table refunds (
  id bigint generated always as identity primary key,
  payment_id bigint not null references payments(id),
  amount_cents bigint not null,
  reason text,
  actor uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ── Prep / kitchen ───────────────────────────────────────────────────────
create table prep_templates (
  id bigint generated always as identity primary key,
  name text not null, category text not null, unit text not null,
  par_qty numeric not null default 0,
  thursday_only boolean not null default false,
  active boolean not null default true, sort_order int not null default 0
);
create table prep_sessions (
  id bigint generated always as identity primary key,
  service_date date not null unique,
  generated_at timestamptz not null default now(),
  generated_by uuid references profiles(id)
);
create table prep_entries (
  id bigint generated always as identity primary key,
  session_id bigint not null references prep_sessions(id) on delete cascade,
  name text not null, category text not null, unit text not null,
  par_qty numeric not null, on_hand_qty numeric, prep_qty numeric not null,
  status prep_status not null default 'not_started',
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);
create table protein_conversions (
  id bigint generated always as identity primary key,
  protein text not null, raw_unit text not null, cooked_unit text not null,
  yield_ratio numeric not null check (yield_ratio > 0)
);

-- ── Fire Drop ────────────────────────────────────────────────────────────
create table fire_drops (
  id bigint generated always as identity primary key,
  friday_date date not null, saturday_date date not null,
  title text, sold_out boolean not null default false,
  created_at timestamptz not null default now(),
  unique (friday_date)
);
create table fire_drop_products (
  id bigint generated always as identity primary key,
  drop_id bigint not null references fire_drops(id) on delete cascade,
  menu_item_id bigint references menu_items(id),
  name text not null, price_cents bigint not null check (price_cents >= 0),
  cap_qty int, sold_qty int not null default 0,
  sold_out boolean not null default false,
  sort_order int not null default 0
);

-- ── Infra ────────────────────────────────────────────────────────────────
create table audit_log (
  id bigint generated always as identity primary key,
  actor uuid references profiles(id),
  action text not null, entity text not null, entity_id text not null,
  before jsonb, after jsonb,
  at timestamptz not null default now()
);
create table webhook_events (
  event_id text primary key,               -- Square event id: idempotency key
  kind text not null,
  raw_body text not null,                  -- exact raw body used for signature verification
  signature_valid boolean not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz                 -- set ONLY after processing work commits
);
create table notifications_outbox (
  id bigint generated always as identity primary key,
  event text not null,                     -- lead.created | order.created | drop.advanced …
  payload jsonb not null,
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- ── updated_at triggers ──────────────────────────────────────────────────
create or replace function touch_updated_at() returns trigger language plpgsql as
$$ begin new.updated_at = now(); return new; end $$;
do $$
declare t text;
begin
  foreach t in array array['profiles','companies','contacts','leads','menu_items','orders','checkout_attempts']
  loop execute format('create trigger %I_touch before update on %I for each row execute function touch_updated_at()', t, t);
  end loop;
end $$;

-- ── RLS ──────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','locations','user_roles','companies','contacts','leads','lead_stage_history',
    'activities','menu_categories','menu_items','menu_variants','pickup_slots','checkout_attempts',
    'orders','order_items','order_status_history','payments','refunds',
    'prep_templates','prep_sessions','prep_entries','protein_conversions',
    'fire_drops','fire_drop_products','audit_log','webhook_events','notifications_outbox']
  loop execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- owner_admin: full access everywhere
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','locations','user_roles','companies','contacts','leads','lead_stage_history',
    'activities','menu_categories','menu_items','menu_variants','pickup_slots','checkout_attempts',
    'orders','order_items','order_status_history','payments','refunds',
    'prep_templates','prep_sessions','prep_entries','protein_conversions',
    'fire_drops','fire_drop_products','audit_log','notifications_outbox']
  loop execute format('create policy %I_admin_all on %I for all using (is_admin()) with check (is_admin())', t, t);
  end loop;
end $$;

-- catering_director
create policy leads_dir on leads for all using (has_role('catering_director')) with check (has_role('catering_director'));
create policy contacts_dir on contacts for all using (has_role('catering_director')) with check (has_role('catering_director'));
create policy companies_dir on companies for all using (has_role('catering_director')) with check (has_role('catering_director'));
create policy activities_dir on activities for all using (has_role('catering_director')) with check (has_role('catering_director'));
create policy lsh_dir on lead_stage_history for all using (has_role('catering_director')) with check (has_role('catering_director'));
create policy orders_dir_read on orders for select using (has_role('catering_director'));
create policy order_items_dir_read on order_items for select using (has_role('catering_director'));

-- kitchen: prep read/write; orders operational read (no pricing → via view below)
create policy prep_sessions_kitchen on prep_sessions for select using (has_role('kitchen'));
create policy prep_entries_kitchen_r on prep_entries for select using (has_role('kitchen'));
create policy prep_entries_kitchen_w on prep_entries for update using (has_role('kitchen')) with check (has_role('kitchen'));
create policy prep_entries_kitchen_i on prep_entries for insert with check (has_role('kitchen'));
create policy protein_kitchen on protein_conversions for select using (has_role('kitchen'));

-- counter_foh: orders operational read/update (status transitions), slots read
create policy orders_foh_r on orders for select using (has_role('counter_foh'));
create policy orders_foh_u on orders for update using (has_role('counter_foh')) with check (has_role('counter_foh'));
create policy order_items_foh_r on order_items for select using (has_role('counter_foh'));
create policy slots_foh_r on pickup_slots for select using (has_role('counter_foh'));

-- packing: read-only order details
create policy orders_pack_r on orders for select using (has_role('packing'));
create policy order_items_pack_r on order_items for select using (has_role('packing'));

-- anonymous/public: NO direct table access. Public reads/writes flow through
-- security-definer RPCs / Edge Functions that return minimal fields and
-- validate tokens; catalog exposure via a column-limited view:
create view public_menu as
  select mi.id, mi.name, mi.description, mi.price_cents, mi.thursday_only,
         mc.name as category, mc.sort_order as category_sort, mi.sort_order
  from menu_items mi join menu_categories mc on mc.id = mi.category_id
  where mi.active and mc.active;

-- kitchen no-pricing view (kitchen role reads orders through this, not the table)
create view kitchen_order_view as
  select o.id, o.order_ref, o.status, o.channel, o.pickup_slot_id, o.created_at,
         oi.name_snapshot, oi.qty
  from orders o join order_items oi on oi.order_id = o.id;
