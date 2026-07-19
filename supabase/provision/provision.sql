-- ============================================================================
-- Station House Fire Sheet V2 — ONE-SHOT PROVISION SCRIPT
-- Paste this whole file into the Supabase SQL Editor and Run.
-- Order: 0001 foundation → 0002 hardening → seed demo data.
-- Safe to run once on a fresh project. Re-running may error on existing
-- objects — that's expected; it means the schema is already in place.
-- ============================================================================

-- ==================== 0001_phase1_foundation.sql ====================
-- ============================================================================
-- Station House Fire Sheet V2 — Phase 1 Foundation
-- Migration: 0001_phase1_foundation.sql
--
-- Conventions (approved spec):
--   * uuid primary keys, default gen_random_uuid() (built-in on PG 13+)
--   * timestamptz created_at / updated_at default now()
--   * updated_at touch trigger on every table that carries updated_at
--   * ALL money stored as integer cents with CHECK (>= 0)
--   * deny-by-default row level security; anon gets NOTHING
--
-- Spec deviation (documented): the helper the spec calls current_role() is
-- named current_staff_role() here because CURRENT_ROLE is a fully reserved
-- SQL keyword in Postgres and cannot be used as an unquoted function name.
-- Behavior is exactly as specified.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
create type public.staff_role as enum
  ('owner', 'manager', 'counter', 'kitchen', 'catering', 'marketing');

create type public.order_type as enum
  ('fire_drop', 'seminole_preorder', 'catering', 'walk_in');

create type public.order_status as enum
  ('draft', 'pending', 'confirmed', 'in_production', 'ready', 'picked_up', 'cancelled');

create type public.payment_status as enum
  ('unpaid', 'pending', 'paid', 'partially_refunded', 'refunded', 'failed');

create type public.lead_stage as enum
  ('new_lead', 'contacted', 'quote_sent', 'follow_up', 'booked', 'lost');

-- ----------------------------------------------------------------------------
-- updated_at touch trigger function
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

-- 1. profiles — one row per staff member, keyed to auth.users
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  email      text,
  role       public.staff_role not null default 'counter',
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- 2. customers
create table public.customers (
  id         uuid primary key default gen_random_uuid(),
  full_name  text not null,
  phone      text,
  email      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_contact_required check (phone is not null or email is not null)
);

create index customers_email_lower_idx on public.customers (lower(email));
create index customers_phone_idx       on public.customers (phone);

create trigger trg_customers_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

-- 3. products
create table public.products (
  id              uuid primary key default gen_random_uuid(),
  sku             text unique not null,
  name            text not null,
  description     text,
  category        text not null,
  price_cents     integer not null check (price_cents >= 0),
  production_unit text,
  active          boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index products_category_sort_idx on public.products (category, sort_order);

create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- 4. orders
create table public.orders (
  id             uuid primary key default gen_random_uuid(),
  order_number   text unique not null,
  customer_id    uuid references public.customers (id),
  order_type     public.order_type not null,
  pickup_day     date,
  pickup_window  text,
  status         public.order_status not null default 'draft',
  payment_status public.payment_status not null default 'unpaid',
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  tax_cents      integer not null default 0 check (tax_cents >= 0),
  tip_cents      integer not null default 0 check (tip_cents >= 0),
  total_cents    integer not null default 0 check (total_cents >= 0),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  completed_at   timestamptz,
  constraint orders_total_matches
    check (total_cents = subtotal_cents + tax_cents + tip_cents)
);

create index orders_status_pickup_day_idx on public.orders (status, pickup_day);
create index orders_order_type_idx        on public.orders (order_type);
create index orders_customer_id_idx       on public.orders (customer_id);
create index orders_created_at_idx        on public.orders (created_at);

create trigger trg_orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- 5. order_items
create table public.order_items (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references public.orders (id) on delete cascade,
  product_id            uuid references public.products (id),
  product_name_snapshot text not null,
  unit_price_cents      integer not null check (unit_price_cents >= 0),
  quantity              integer not null check (quantity > 0),
  line_total_cents      integer not null check (line_total_cents >= 0),
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint order_items_line_total_matches
    check (line_total_cents = unit_price_cents * quantity)
);

create index order_items_order_id_idx on public.order_items (order_id);

create trigger trg_order_items_updated_at
  before update on public.order_items
  for each row execute function public.set_updated_at();

-- 6. catering_leads
create table public.catering_leads (
  id                    uuid primary key default gen_random_uuid(),
  customer_id           uuid references public.customers (id),
  contact_name          text not null,
  company_name          text,
  event_description     text,
  estimated_value_cents integer check (estimated_value_cents >= 0),
  source                text not null default 'direct',
  stage                 public.lead_stage not null default 'new_lead',
  event_date            date,
  guest_count           integer check (guest_count > 0),
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index catering_leads_stage_idx      on public.catering_leads (stage);
create index catering_leads_event_date_idx on public.catering_leads (event_date);

create trigger trg_catering_leads_updated_at
  before update on public.catering_leads
  for each row execute function public.set_updated_at();

-- 7. audit_log (append-only; no updated_at by design)
create table public.audit_log (
  id            bigint generated always as identity primary key,
  actor_user_id uuid references auth.users (id),
  entity_type   text not null,
  entity_id     text not null,
  action        text not null,
  before_data   jsonb,
  after_data    jsonb,
  created_at    timestamptz not null default now()
);

create index audit_log_entity_idx     on public.audit_log (entity_type, entity_id);
create index audit_log_created_at_idx on public.audit_log (created_at);

-- ----------------------------------------------------------------------------
-- Order-number strategy (collision-safe, DB-enforced)
-- ----------------------------------------------------------------------------
-- Per-day, per-prefix counters. The UPSERT below is concurrency-safe: two
-- concurrent callers serialize on the (day, prefix) row and each gets a
-- distinct counter value. The UNIQUE constraint on orders.order_number is
-- the final backstop against collisions.
create table public.order_number_counters (
  day     date    not null,
  prefix  text    not null,
  counter integer not null default 0,
  primary key (day, prefix)
);

create or replace function public.next_order_number(p_type public.order_type)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix  text;
  v_day     date;
  v_counter integer;
begin
  v_prefix := case p_type
    when 'fire_drop'         then 'FD'
    when 'seminole_preorder' then 'SP'
    when 'catering'          then 'CT'
    when 'walk_in'           then 'WI'
  end;

  -- Business day in the shop's timezone, not UTC.
  v_day := (now() at time zone 'America/New_York')::date;

  insert into public.order_number_counters as c (day, prefix, counter)
  values (v_day, v_prefix, 1)
  on conflict (day, prefix)
  do update set counter = c.counter + 1
  returning c.counter into v_counter;

  -- e.g. FD-20260718-1042  (number = 1000 + counter)
  return format('%s-%s-%s', v_prefix, to_char(v_day, 'YYYYMMDD'), (1000 + v_counter)::text);
end;
$$;

-- BEFORE INSERT: fill order_number when the caller did not supply one.
create or replace function public.orders_fill_order_number()
returns trigger
language plpgsql
as $$
begin
  if new.order_number is null then
    new.order_number := public.next_order_number(new.order_type);
  end if;
  return new;
end;
$$;

create trigger trg_orders_fill_order_number
  before insert on public.orders
  for each row execute function public.orders_fill_order_number();

-- ----------------------------------------------------------------------------
-- RLS helper functions
-- ----------------------------------------------------------------------------
-- Spec name current_role() is a reserved SQL keyword; named current_staff_role().
-- SECURITY DEFINER so it can read profiles without tripping profiles RLS
-- (also avoids policy recursion). Returns NULL when unauthenticated, when the
-- profile row is missing, or when the profile is inactive.
create or replace function public.current_staff_role()
returns public.staff_role
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.active;
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_staff_role() = 'owner', false);
$$;

-- Any active profile counts as staff.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active
  );
$$;

-- ----------------------------------------------------------------------------
-- Kitchen view — production fields only, NO money columns.
-- security_invoker so the querying user's RLS on orders applies.
-- Phase 1: kitchen still has base-table SELECT on orders (see policy below);
-- Phase 2 hardens this with column-level masking so kitchen sees only this view.
-- ----------------------------------------------------------------------------
create view public.kitchen_orders_v
with (security_invoker = on) as
select
  o.id,
  o.order_number,
  o.order_type,
  o.pickup_day,
  o.pickup_window,
  o.status,
  o.notes
from public.orders o;

-- ----------------------------------------------------------------------------
-- Row Level Security — deny by default
-- ----------------------------------------------------------------------------
alter table public.profiles              enable row level security;
alter table public.customers             enable row level security;
alter table public.products              enable row level security;
alter table public.orders                enable row level security;
alter table public.order_items           enable row level security;
alter table public.catering_leads        enable row level security;
alter table public.audit_log             enable row level security;
alter table public.order_number_counters enable row level security;

-- ---- profiles ----
-- owner: full control (role management lives here).
create policy profiles_owner_all on public.profiles
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- manager: read-only on profiles — managers can NOT manage roles.
create policy profiles_manager_select on public.profiles
  for select to authenticated
  using (public.current_staff_role() = 'manager');

-- every authenticated active staff member can read their own profile row.
create policy profiles_self_select on public.profiles
  for select to authenticated
  using (id = auth.uid());

-- ---- customers ----
create policy customers_owner_all on public.customers
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

create policy customers_manager_all on public.customers
  for all to authenticated
  using (public.current_staff_role() = 'manager')
  with check (public.current_staff_role() = 'manager');

create policy customers_catering_all on public.customers
  for all to authenticated
  using (public.current_staff_role() = 'catering')
  with check (public.current_staff_role() = 'catering');

create policy customers_counter_select on public.customers
  for select to authenticated
  using (public.current_staff_role() = 'counter');

-- counter takes walk-ins, so they may create customers.
create policy customers_counter_insert on public.customers
  for insert to authenticated
  with check (public.current_staff_role() = 'counter');

-- ---- products ----
create policy products_owner_all on public.products
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

create policy products_manager_all on public.products
  for all to authenticated
  using (public.current_staff_role() = 'manager')
  with check (public.current_staff_role() = 'manager');

create policy products_counter_select on public.products
  for select to authenticated
  using (public.current_staff_role() = 'counter');

create policy products_marketing_select on public.products
  for select to authenticated
  using (public.current_staff_role() = 'marketing');

-- ---- orders ----
create policy orders_owner_all on public.orders
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

create policy orders_manager_all on public.orders
  for all to authenticated
  using (public.current_staff_role() = 'manager')
  with check (public.current_staff_role() = 'manager');

create policy orders_counter_select on public.orders
  for select to authenticated
  using (public.current_staff_role() = 'counter');

-- counter takes walk-ins.
create policy orders_counter_insert on public.orders
  for insert to authenticated
  with check (public.current_staff_role() = 'counter');

-- counter UPDATE is intentionally limited in intent (status transitions to
-- ready/picked_up), but Phase 1 enforces the transition rules app-side.
-- Phase 2 lands a transition-guard trigger that rejects illegal
-- status/field changes at the database layer.
create policy orders_counter_update on public.orders
  for update to authenticated
  using (public.current_staff_role() = 'counter')
  with check (public.current_staff_role() = 'counter');

-- kitchen: Phase 1 still allows base-table SELECT (money columns visible);
-- kitchen_orders_v above is the sanctioned production view, and Phase 2
-- hardens with column masking so the view becomes kitchen's only read path.
create policy orders_kitchen_select on public.orders
  for select to authenticated
  using (public.current_staff_role() = 'kitchen');

-- kitchen may update orders (intended: status only — in_production/ready).
-- Postgres policies cannot restrict columns; column-level guard lands Phase 2.
create policy orders_kitchen_update on public.orders
  for update to authenticated
  using (public.current_staff_role() = 'kitchen')
  with check (public.current_staff_role() = 'kitchen');

create policy orders_catering_select on public.orders
  for select to authenticated
  using (
    public.current_staff_role() = 'catering'
    and order_type = 'catering'
  );

-- ---- order_items ----
create policy order_items_owner_all on public.order_items
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

create policy order_items_manager_all on public.order_items
  for all to authenticated
  using (public.current_staff_role() = 'manager')
  with check (public.current_staff_role() = 'manager');

create policy order_items_counter_select on public.order_items
  for select to authenticated
  using (public.current_staff_role() = 'counter');

create policy order_items_counter_insert on public.order_items
  for insert to authenticated
  with check (public.current_staff_role() = 'counter');

create policy order_items_kitchen_select on public.order_items
  for select to authenticated
  using (public.current_staff_role() = 'kitchen');

create policy order_items_catering_select on public.order_items
  for select to authenticated
  using (
    public.current_staff_role() = 'catering'
    and exists (
      select 1
      from public.orders o
      where o.id = order_items.order_id
        and o.order_type = 'catering'
    )
  );

-- ---- catering_leads ----
create policy catering_leads_owner_all on public.catering_leads
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

create policy catering_leads_manager_all on public.catering_leads
  for all to authenticated
  using (public.current_staff_role() = 'manager')
  with check (public.current_staff_role() = 'manager');

create policy catering_leads_catering_all on public.catering_leads
  for all to authenticated
  using (public.current_staff_role() = 'catering')
  with check (public.current_staff_role() = 'catering');

create policy catering_leads_marketing_select on public.catering_leads
  for select to authenticated
  using (public.current_staff_role() = 'marketing');

-- ---- audit_log ----
create policy audit_log_owner_all on public.audit_log
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

create policy audit_log_manager_select on public.audit_log
  for select to authenticated
  using (public.current_staff_role() = 'manager');

-- any active staff member may append audit entries.
create policy audit_log_staff_insert on public.audit_log
  for insert to authenticated
  with check (public.is_staff());

-- ---- order_number_counters ----
-- All non-owner access flows through next_order_number() (SECURITY DEFINER).
create policy order_number_counters_owner_all on public.order_number_counters
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- ----------------------------------------------------------------------------
-- Grants — anon gets NOTHING; authenticated is gated entirely by RLS.
-- ----------------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant select on public.kitchen_orders_v to authenticated;

revoke execute on function public.next_order_number(public.order_type) from public, anon;
grant  execute on function public.next_order_number(public.order_type) to authenticated, service_role;

-- ==================== 0002_phase2_hardening.sql ====================
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

-- ==================== seed/seed.sql ====================
-- ============================================================================
-- Station House Fire Sheet V2 — Phase 1 seed data (DEMO DATA ONLY)
-- File: supabase/seed/seed.sql
--
-- Preserves the prototype menu concept, converted to integer cents.
-- All inserts are idempotent: stable SKUs / fixed UUIDs + ON CONFLICT DO NOTHING.
-- Customers are obviously fake (555-01xx phones, @example.com emails).
--
-- Money math convention: 7.5% sales tax, rounded half-up to the nearest cent.
--   tax_cents = round(subtotal_cents * 0.075)   (half-up)
--   total_cents = subtotal_cents + tax_cents + tip_cents
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Products — the 8 prototype menu items
-- ----------------------------------------------------------------------------
insert into public.products (sku, name, description, category, price_cents, production_unit, sort_order)
values
  ('TD-HALF', 'Tampa Diamonds 1/2 lb',        'Half pound of our signature Tampa Diamonds burnt ends.', 'Signature', 2300,  'lb',   10),
  ('TD-LB',   'Tampa Diamonds 1 lb',          'Full pound of our signature Tampa Diamonds burnt ends.', 'Signature', 4599,  'lb',   20),
  ('PS-10',   'Party Sampler — Feeds 10',     'Sampler spread that feeds ten.',                         'Samplers',  26900, 'each', 30),
  ('PS-20',   'Party Sampler — Feeds 20',     'Sampler spread that feeds twenty.',                      'Samplers',  56900, 'each', 40),
  ('RIBS-FR', 'St. Louis Ribs — Full Rack',   'Full rack of St. Louis style ribs.',                     'Meats',     3400,  'each', 50),
  ('PP-LB',   'Pulled Pork 1 lb',             'Slow-smoked pulled pork by the pound.',                  'Meats',     1900,  'lb',   60),
  ('MAC-PT',  'Mac & Cheese — Pint',          'Smoked gouda mac and cheese.',                           'Sides',     1200,  'pint', 70),
  ('PUD-PT',  'Banana Pudding — Pint',        'Classic banana pudding.',                                'Dessert',   1400,  'pint', 80)
on conflict (sku) do nothing;

-- ----------------------------------------------------------------------------
-- Customers — 4 obviously-fake demo customers (fixed UUIDs for idempotency)
-- ----------------------------------------------------------------------------
insert into public.customers (id, full_name, phone, email)
values
  ('11111111-1111-1111-1111-111111110001', 'Demo Customer One',   '555-0101', 'demo.one@example.com'),
  ('11111111-1111-1111-1111-111111110002', 'Demo Customer Two',   '555-0102', 'demo.two@example.com'),
  ('11111111-1111-1111-1111-111111110003', 'Demo Customer Three', '555-0103', 'demo.three@example.com'),
  ('11111111-1111-1111-1111-111111110004', 'Demo Customer Four',  '555-0104', 'demo.four@example.com')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- Orders — 4 fire_drop orders via next_order_number()
-- (re-running bumps the day counter harmlessly; rows are skipped on conflict)
-- ----------------------------------------------------------------------------

-- Order 1: 1x TD-LB (4599) + 2x MAC-PT (2400) = 6999
--          tax = round(6999 * 0.075) = round(524.925) = 525; total 7524
insert into public.orders (id, order_number, customer_id, order_type, pickup_day, pickup_window,
                           status, payment_status, subtotal_cents, tax_cents, tip_cents, total_cents, notes)
values ('22222222-2222-2222-2222-222222220001', public.next_order_number('fire_drop'),
        '11111111-1111-1111-1111-111111110001', 'fire_drop', '2026-07-24', '11:00-13:00',
        'confirmed', 'paid', 6999, 525, 0, 7524, 'Demo order — no substitutions.')
on conflict (id) do nothing;

-- Order 2: 2x TD-HALF (4600) + 1x RIBS-FR (3400) = 8000
--          tax = round(8000 * 0.075) = 600; total 8600
insert into public.orders (id, order_number, customer_id, order_type, pickup_day, pickup_window,
                           status, payment_status, subtotal_cents, tax_cents, tip_cents, total_cents, notes)
values ('22222222-2222-2222-2222-222222220002', public.next_order_number('fire_drop'),
        '11111111-1111-1111-1111-111111110002', 'fire_drop', '2026-07-24', '13:00-15:00',
        'pending', 'unpaid', 8000, 600, 0, 8600, null)
on conflict (id) do nothing;

-- Order 3 (20% tip): 1x PS-10 (26900) + 1x PUD-PT (1400) = 28300
--          tax = round(28300 * 0.075) = round(2122.5) = 2123 (half-up)
--          tip = 20% of subtotal = 5660; total = 28300 + 2123 + 5660 = 36083
insert into public.orders (id, order_number, customer_id, order_type, pickup_day, pickup_window,
                           status, payment_status, subtotal_cents, tax_cents, tip_cents, total_cents, notes)
values ('22222222-2222-2222-2222-222222220003', public.next_order_number('fire_drop'),
        '11111111-1111-1111-1111-111111110003', 'fire_drop', '2026-07-25', '11:00-13:00',
        'ready', 'paid', 28300, 2123, 5660, 36083, 'Demo order — includes 20% tip.')
on conflict (id) do nothing;

-- Order 4: 3x PP-LB (5700) + 1x MAC-PT (1200) = 6900
--          tax = round(6900 * 0.075) = round(517.5) = 518 (half-up); total 7418
insert into public.orders (id, order_number, customer_id, order_type, pickup_day, pickup_window,
                           status, payment_status, subtotal_cents, tax_cents, tip_cents, total_cents,
                           notes, completed_at)
values ('22222222-2222-2222-2222-222222220004', public.next_order_number('fire_drop'),
        '11111111-1111-1111-1111-111111110004', 'fire_drop', '2026-07-25', '13:00-15:00',
        'picked_up', 'paid', 6900, 518, 0, 7418, null, now())
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- Order items — structured lines with exact cents math
-- ----------------------------------------------------------------------------
insert into public.order_items (id, order_id, product_id, product_name_snapshot,
                                unit_price_cents, quantity, line_total_cents)
values
  -- Order 1
  ('33333333-3333-3333-3333-333333330001', '22222222-2222-2222-2222-222222220001',
   (select id from public.products where sku = 'TD-LB'),   'Tampa Diamonds 1 lb',   4599, 1, 4599),
  ('33333333-3333-3333-3333-333333330002', '22222222-2222-2222-2222-222222220001',
   (select id from public.products where sku = 'MAC-PT'),  'Mac & Cheese — Pint',   1200, 2, 2400),
  -- Order 2
  ('33333333-3333-3333-3333-333333330003', '22222222-2222-2222-2222-222222220002',
   (select id from public.products where sku = 'TD-HALF'), 'Tampa Diamonds 1/2 lb', 2300, 2, 4600),
  ('33333333-3333-3333-3333-333333330004', '22222222-2222-2222-2222-222222220002',
   (select id from public.products where sku = 'RIBS-FR'), 'St. Louis Ribs — Full Rack', 3400, 1, 3400),
  -- Order 3
  ('33333333-3333-3333-3333-333333330005', '22222222-2222-2222-2222-222222220003',
   (select id from public.products where sku = 'PS-10'),   'Party Sampler — Feeds 10', 26900, 1, 26900),
  ('33333333-3333-3333-3333-333333330006', '22222222-2222-2222-2222-222222220003',
   (select id from public.products where sku = 'PUD-PT'),  'Banana Pudding — Pint', 1400, 1, 1400),
  -- Order 4
  ('33333333-3333-3333-3333-333333330007', '22222222-2222-2222-2222-222222220004',
   (select id from public.products where sku = 'PP-LB'),   'Pulled Pork 1 lb',      1900, 3, 5700),
  ('33333333-3333-3333-3333-333333330008', '22222222-2222-2222-2222-222222220004',
   (select id from public.products where sku = 'MAC-PT'),  'Mac & Cheese — Pint',   1200, 1, 1200)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- Catering leads — 6 leads covering every pipeline stage
-- ----------------------------------------------------------------------------
insert into public.catering_leads (id, customer_id, contact_name, company_name, event_description,
                                   estimated_value_cents, source, stage, event_date, guest_count, notes)
values
  ('44444444-4444-4444-4444-444444440001', null,
   'Demo Lead One',   'Example Corp',        'Office lunch drop for Q3 kickoff.',
   150000, 'direct',   'new_lead',   '2026-08-15', 50,  'Came in via counter conversation.'),
  ('44444444-4444-4444-4444-444444440002', null,
   'Demo Lead Two',   'Sample Industries',   'Retirement party, full BBQ spread.',
   250000, 'referral', 'contacted',  '2026-08-22', 80,  'Left voicemail; follow up Tuesday.'),
  ('44444444-4444-4444-4444-444444440003', null,
   'Demo Lead Three', 'Test University',     'Alumni tailgate package.',
   480000, 'website',  'quote_sent', '2026-09-05', 120, 'Quote #Q-2026-014 sent.'),
  ('44444444-4444-4444-4444-444444440004', null,
   'Demo Lead Four',  null,                  'Backyard wedding rehearsal dinner.',
   175000, 'direct',   'follow_up',  '2026-09-12', 60,  'Deciding between us and a competitor.'),
  ('44444444-4444-4444-4444-444444440005', '11111111-1111-1111-1111-111111110004',
   'Demo Lead Five',  'Placeholder Partners','Quarterly all-hands BBQ, repeat client.',
   620000, 'referral', 'booked',     '2026-08-29', 150, 'Deposit received; menu locked.'),
  ('44444444-4444-4444-4444-444444440006', null,
   'Demo Lead Six',   null,                  'Small birthday gathering.',
   90000,  'website',  'lost',       '2026-08-08', 30,  'Went with a cheaper option.')
on conflict (id) do nothing;
