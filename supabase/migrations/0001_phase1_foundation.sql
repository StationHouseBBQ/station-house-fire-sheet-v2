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
