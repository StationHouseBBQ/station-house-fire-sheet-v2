-- ============================================================================
-- Station House Fire Sheet V2 — Phase 1 RLS role-matrix tests (pgTAP)
-- File: supabase/tests/rls_role_tests.sql
--
-- HOW TO RUN (local Supabase stack, after migrations + seed):
--   1. supabase start && supabase db reset
--   2. psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -v ON_ERROR_STOP=1 -f supabase/seed/seed.sql        # if not auto-seeded
--   3. psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -v ON_ERROR_STOP=1 -f supabase/tests/rls_role_tests.sql
--
-- Simulates Supabase JWT auth per role via:
--   set local role authenticated;
--   set local request.jwt.claims to '{"sub": "<user uuid>", ...}';
-- (auth.uid() reads the sub claim). Test users/profiles are created inside
-- the transaction and rolled back — nothing is left behind.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;

select plan(12);

-- ----------------------------------------------------------------------------
-- Fixtures (created as the migration owner, bypassing RLS)
-- ----------------------------------------------------------------------------
insert into auth.users (id, aud, role, email)
values
  ('cccccccc-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'counter.demo@example.com'),
  ('cccccccc-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'marketing.demo@example.com'),
  ('cccccccc-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'owner.demo@example.com'),
  ('cccccccc-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'kitchen.demo@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, full_name, email, role)
values
  ('cccccccc-0000-0000-0000-000000000001', 'Demo Counter',   'counter.demo@example.com',   'counter'),
  ('cccccccc-0000-0000-0000-000000000002', 'Demo Marketing', 'marketing.demo@example.com', 'marketing'),
  ('cccccccc-0000-0000-0000-000000000003', 'Demo Owner',     'owner.demo@example.com',     'owner'),
  ('cccccccc-0000-0000-0000-000000000004', 'Demo Kitchen',   'kitchen.demo@example.com',   'kitchen')
on conflict (id) do nothing;

insert into public.orders (id, order_number, order_type, status)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'RLS-TEST-0001', 'fire_drop', 'confirmed')
on conflict (id) do nothing;

insert into public.products (sku, name, category, price_cents)
values ('RLS-TEST-SKU', 'RLS Test Product', 'Test', 100)
on conflict (sku) do nothing;

insert into public.catering_leads (id, contact_name, estimated_value_cents, stage)
values ('bbbbbbbb-0000-0000-0000-000000000002', 'RLS Test Lead', 100000, 'new_lead')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- counter
-- ----------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "cccccccc-0000-0000-0000-000000000001", "role": "authenticated"}';

select is((select public.current_staff_role()), 'counter'::public.staff_role,
  'jwt simulation resolves the counter role');

select is(
  (with u as (
     update public.orders set status = 'ready'
     where id = 'bbbbbbbb-0000-0000-0000-000000000001'
     returning 1)
   select count(*)::int from u),
  1,
  'counter CAN update order status');

select ok((select count(*) from public.products) > 0,
  'counter can read products');

select is((select count(*)::int from public.catering_leads), 0,
  'counter cannot see catering_leads');

-- ----------------------------------------------------------------------------
-- marketing
-- ----------------------------------------------------------------------------
set local request.jwt.claims to '{"sub": "cccccccc-0000-0000-0000-000000000002", "role": "authenticated"}';

select is(
  (with u as (
     update public.orders set status = 'cancelled'
     where id = 'bbbbbbbb-0000-0000-0000-000000000001'
     returning 1)
   select count(*)::int from u),
  0,
  'marketing can NOT update orders (0 rows touched)');

select is((select count(*)::int from public.orders), 0,
  'marketing cannot see orders at all');

select ok((select count(*) from public.catering_leads) > 0,
  'marketing can read catering_leads');

select ok((select count(*) from public.products) > 0,
  'marketing can read products');

select is((select count(*)::int from public.customers), 0,
  'marketing cannot see customers');

-- ----------------------------------------------------------------------------
-- kitchen
-- ----------------------------------------------------------------------------
set local request.jwt.claims to '{"sub": "cccccccc-0000-0000-0000-000000000004", "role": "authenticated"}';

select ok((select count(*) from public.kitchen_orders_v) > 0,
  'kitchen can read the production view (kitchen_orders_v)');

-- Phase 2 hardening: kitchen lost base-table access to orders; status
-- writes now flow through kitchen_orders_v (see 0002_phase2_hardening.sql).
select is(
  (with u as (
     update public.kitchen_orders_v set status = 'in_production'
     where id = 'bbbbbbbb-0000-0000-0000-000000000001'
     returning 1)
   select count(*)::int from u),
  1,
  'kitchen CAN update order status (via kitchen_orders_v)');

-- ----------------------------------------------------------------------------
-- owner
-- ----------------------------------------------------------------------------
set local request.jwt.claims to '{"sub": "cccccccc-0000-0000-0000-000000000003", "role": "authenticated"}';

select ok((select count(*) from public.profiles) >= 4,
  'owner sees all profiles');

reset role;

select * from finish();
rollback;
