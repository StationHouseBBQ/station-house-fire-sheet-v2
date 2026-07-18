-- ============================================================================
-- Station House Fire Sheet V2 — Phase 2 hardening tests (pgTAP)
-- File: supabase/tests/phase2_tests.sql
--
-- HOW TO RUN (local Supabase stack, after migrations + seed):
--   1. supabase start && supabase db reset
--   2. psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -v ON_ERROR_STOP=1 -f supabase/seed/seed.sql        # if not auto-seeded
--   3. psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -v ON_ERROR_STOP=1 -f supabase/tests/phase2_tests.sql
--
-- Requires the Phase 1 seed (products TD-HALF @2300 and PP-LB @1900).
-- Simulates Supabase JWT auth per role (same pattern as rls_role_tests.sql):
--   set local role authenticated;
--   set local request.jwt.claims to '{"sub": "<user uuid>", ...}';
-- All fixtures are created inside this transaction and rolled back.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;

select plan(40);

-- ----------------------------------------------------------------------------
-- Fixtures (created as the migration owner, bypassing RLS)
-- ----------------------------------------------------------------------------
insert into auth.users (id, aud, role, email)
values
  ('dddddddd-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'p2.counter@example.com'),
  ('dddddddd-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'p2.marketing@example.com'),
  ('dddddddd-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'p2.owner@example.com'),
  ('dddddddd-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'p2.kitchen@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, full_name, email, role)
values
  ('dddddddd-0000-0000-0000-000000000001', 'P2 Counter',   'p2.counter@example.com',   'counter'),
  ('dddddddd-0000-0000-0000-000000000002', 'P2 Marketing', 'p2.marketing@example.com', 'marketing'),
  ('dddddddd-0000-0000-0000-000000000003', 'P2 Owner',     'p2.owner@example.com',     'owner'),
  ('dddddddd-0000-0000-0000-000000000004', 'P2 Kitchen',   'p2.kitchen@example.com',   'kitchen')
on conflict (id) do nothing;

-- inactive product for the create_order rejection test
insert into public.products (sku, name, category, price_cents, active)
values ('P2-INACT', 'Phase2 Inactive Product', 'Test', 999, false)
on conflict (sku) do nothing;

-- fixture orders for the transition-guard matrix
insert into public.orders (id, order_number, order_type, status)
values
  ('eeeeeeee-0000-0000-0000-000000000001', 'P2-GUARD-0001', 'fire_drop', 'confirmed'),     -- counter: -> ready
  ('eeeeeeee-0000-0000-0000-000000000002', 'P2-GUARD-0002', 'fire_drop', 'picked_up'),     -- counter: undo -> ready
  ('eeeeeeee-0000-0000-0000-000000000003', 'P2-GUARD-0003', 'fire_drop', 'confirmed'),     -- counter blocked -> cancelled; later service ctx
  ('eeeeeeee-0000-0000-0000-000000000004', 'P2-GUARD-0004', 'fire_drop', 'confirmed'),     -- kitchen: -> in_production
  ('eeeeeeee-0000-0000-0000-000000000005', 'P2-GUARD-0005', 'fire_drop', 'in_production'), -- kitchen blocked -> picked_up
  ('eeeeeeee-0000-0000-0000-000000000006', 'P2-GUARD-0006', 'fire_drop', 'confirmed'),     -- marketing blocked (0 rows)
  ('eeeeeeee-0000-0000-0000-000000000007', 'P2-GUARD-0007', 'fire_drop', 'in_production')  -- owner: -> cancelled
on conflict (id) do nothing;

insert into public.order_items (id, order_id, product_name_snapshot, unit_price_cents, quantity, line_total_cents)
values ('eeeeeeee-0000-0000-0000-000000000101', 'eeeeeeee-0000-0000-0000-000000000004',
        'Guard Item', 100, 1, 100)
on conflict (id) do nothing;

-- capture create_order() return values across role switches
create temp table p2_r1 (r jsonb);
create temp table p2_r2 (r jsonb);
grant all on table p2_r1, p2_r2 to authenticated;

-- ----------------------------------------------------------------------------
-- create_order: happy path (counter), 2x TD-HALF + 460 tip
--   subtotal = 2 * 2300 = 4600
--   tax      = (4600*750 + 5000) / 10000 = 345   (7.5%, half-up)
--   total    = 4600 + 345 + 460 = 5405
-- ----------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "dddddddd-0000-0000-0000-000000000001", "role": "authenticated"}';

insert into p2_r1
select public.create_order(
  jsonb_build_object('full_name', 'P2 Buyer', 'phone', '555-0177', 'email', 'p2.buyer@example.com'),
  'fire_drop',
  date '2026-07-24',
  '11:00-13:00',
  jsonb_build_array(jsonb_build_object(
    'product_id', (select id from public.products where sku = 'TD-HALF'),
    'quantity',   2)),
  460,
  'phase2 happy-path order');

select is((select (r->>'subtotal_cents')::int from p2_r1), 4600,
  'create_order: subtotal comes from DB prices (2 x TD-HALF = 4600)');
select is((select (r->>'tax_cents')::int from p2_r1), 345,
  'create_order: tax is 7.5% half-up (345)');
select is((select (r->>'tip_cents')::int from p2_r1), 460,
  'create_order: tip is stored as passed (460)');
select is((select (r->>'total_cents')::int from p2_r1), 5405,
  'create_order: total = subtotal + tax + tip (5405)');
select is((select r->>'status' from p2_r1), 'confirmed',
  'create_order: order lands as status confirmed');
select is((select r->>'payment_status' from p2_r1), 'unpaid',
  'create_order: order lands as payment_status unpaid');
select matches((select r->>'order_number' from p2_r1), '^FD-\d{8}-\d{4,}$',
  'create_order: order_number filled by the existing trigger (FD prefix)');
select is((select jsonb_array_length(r->'items') from p2_r1), 1,
  'create_order: returns the items array (1 line)');
select is((select r->'items'->0->>'product_name_snapshot' from p2_r1), 'Tampa Diamonds 1/2 lb',
  'create_order: item carries the product name snapshot');
select is((select (r->'items'->0->>'line_total_cents')::int from p2_r1), 4600,
  'create_order: item line total is unit price x quantity (4600)');

-- second order, same customer email: 3x PP-LB, no tip
--   subtotal = 5700; tax = (5700*750 + 5000) / 10000 = 428  (427.5 rounds UP)
insert into p2_r2
select public.create_order(
  jsonb_build_object('full_name', 'P2 Buyer', 'email', 'P2.BUYER@example.com'),
  'walk_in',
  null,
  null,
  jsonb_build_array(jsonb_build_object(
    'product_id', (select id from public.products where sku = 'PP-LB'),
    'quantity',   3)),
  0,
  null);

select is((select (r->>'tax_cents')::int from p2_r2), 428,
  'create_order: 427.5 rounds half-up to 428');
select is((select r->>'customer_id' from p2_r2), (select r->>'customer_id' from p2_r1),
  'create_order: find-or-create matches the existing customer by lower(email)');

-- ----------------------------------------------------------------------------
-- create_order: rejections (still counter)
-- ----------------------------------------------------------------------------
select throws_ok(
  $q$select public.create_order(
       jsonb_build_object('full_name', 'X', 'phone', '555-1'),
       'walk_in', null, null, '[]'::jsonb, 0, null)$q$,
  'P0001', null,
  'create_order rejects an empty items array');

select throws_ok(
  $q$select public.create_order(
       jsonb_build_object('full_name', 'X', 'phone', '555-1'),
       'walk_in', null, null,
       jsonb_build_array(jsonb_build_object(
         'product_id', (select id from public.products where sku = 'TD-HALF'),
         'quantity', 0)),
       0, null)$q$,
  'P0001', null,
  'create_order rejects quantity 0');

select throws_ok(
  $q$select public.create_order(
       jsonb_build_object('full_name', 'X', 'phone', '555-1'),
       'walk_in', null, null,
       jsonb_build_array(jsonb_build_object(
         'product_id', (select id from public.products where sku = 'P2-INACT'),
         'quantity', 1)),
       0, null)$q$,
  'P0001', null,
  'create_order rejects an inactive product');

select throws_ok(
  $q$select public.create_order(
       jsonb_build_object('full_name', 'X', 'phone', '555-1'),
       'walk_in', null, null,
       jsonb_build_array(jsonb_build_object(
         'product_id', 'ffffffff-ffff-ffff-ffff-ffffffffffff',
         'quantity', 1)),
       0, null)$q$,
  'P0001', null,
  'create_order rejects an unknown product');

select throws_ok(
  $q$select public.create_order(
       jsonb_build_object('full_name', 'X', 'phone', '555-1'),
       'walk_in', null, null,
       jsonb_build_array(jsonb_build_object(
         'product_id', (select id from public.products where sku = 'TD-HALF'),
         'quantity', 1)),
       -100, null)$q$,
  'P0001', null,
  'create_order rejects a negative tip');

select throws_ok(
  $q$select public.create_order(
       jsonb_build_object('phone', '555-2'),
       'walk_in', null, null,
       jsonb_build_array(jsonb_build_object(
         'product_id', (select id from public.products where sku = 'TD-HALF'),
         'quantity', 1)),
       0, null)$q$,
  'P0001', null,
  'create_order rejects a customer without full_name');

-- a JWT whose sub has no active staff profile
set local request.jwt.claims to '{"sub": "dddddddd-0000-0000-0000-000000000099", "role": "authenticated"}';

select throws_ok(
  $q$select public.create_order(
       jsonb_build_object('full_name', 'X', 'phone', '555-1'),
       'walk_in', null, null,
       jsonb_build_array(jsonb_build_object('product_id',
         'ffffffff-ffff-ffff-ffff-ffffffffffff', 'quantity', 1)),
       0, null)$q$,
  'P0001', null,
  'create_order rejects a caller who is not active staff');

-- ----------------------------------------------------------------------------
-- Transition guard: counter
-- ----------------------------------------------------------------------------
set local request.jwt.claims to '{"sub": "dddddddd-0000-0000-0000-000000000001", "role": "authenticated"}';

select is(
  (with u as (
     update public.orders set status = 'ready'
     where id = 'eeeeeeee-0000-0000-0000-000000000001'
     returning 1)
   select count(*)::int from u),
  1,
  'guard: counter CAN move confirmed -> ready');

select is(
  (with u as (
     update public.orders set status = 'ready'
     where id = 'eeeeeeee-0000-0000-0000-000000000002'
     returning 1)
   select count(*)::int from u),
  1,
  'guard: counter CAN undo picked_up -> ready');

select throws_ok(
  $q$update public.orders set status = 'cancelled'
     where id = 'eeeeeeee-0000-0000-0000-000000000003'$q$,
  '42501', null,
  'guard: counter can NOT move confirmed -> cancelled');

-- ----------------------------------------------------------------------------
-- Transition guard: kitchen (writes flow through kitchen_orders_v)
-- ----------------------------------------------------------------------------
set local request.jwt.claims to '{"sub": "dddddddd-0000-0000-0000-000000000004", "role": "authenticated"}';

select is(
  (with u as (
     update public.kitchen_orders_v set status = 'in_production'
     where id = 'eeeeeeee-0000-0000-0000-000000000004'
     returning 1)
   select count(*)::int from u),
  1,
  'guard: kitchen CAN move confirmed -> in_production (via view)');

select throws_ok(
  $q$update public.kitchen_orders_v set status = 'picked_up'
     where id = 'eeeeeeee-0000-0000-0000-000000000005'$q$,
  '42501', null,
  'guard: kitchen can NOT move in_production -> picked_up');

-- ----------------------------------------------------------------------------
-- Transition guard: marketing (blocked before the trigger, 0 rows reachable)
-- ----------------------------------------------------------------------------
set local request.jwt.claims to '{"sub": "dddddddd-0000-0000-0000-000000000002", "role": "authenticated"}';

select is(
  (with u as (
     update public.orders set status = 'cancelled'
     where id = 'eeeeeeee-0000-0000-0000-000000000006'
     returning 1)
   select count(*)::int from u),
  0,
  'guard: marketing can NOT update order status on the base table (0 rows)');

select is(
  (with u as (
     update public.kitchen_orders_v set status = 'cancelled'
     where id = 'eeeeeeee-0000-0000-0000-000000000006'
     returning 1)
   select count(*)::int from u),
  0,
  'guard: marketing can NOT update order status via the kitchen view (0 rows)');

-- ----------------------------------------------------------------------------
-- Transition guard: owner
-- ----------------------------------------------------------------------------
set local request.jwt.claims to '{"sub": "dddddddd-0000-0000-0000-000000000003", "role": "authenticated"}';

select is(
  (with u as (
     update public.orders set status = 'cancelled'
     where id = 'eeeeeeee-0000-0000-0000-000000000007'
     returning 1)
   select count(*)::int from u),
  1,
  'guard: owner CAN move in_production -> cancelled');

-- ----------------------------------------------------------------------------
-- Kitchen money masking
-- ----------------------------------------------------------------------------
set local request.jwt.claims to '{"sub": "dddddddd-0000-0000-0000-000000000004", "role": "authenticated"}';

select is((select count(*)::int from public.orders), 0,
  'masking: kitchen can NOT select the orders base table');

select is((select count(*)::int from public.order_items), 0,
  'masking: kitchen can NOT select the order_items base table');

select ok((select count(*) from public.kitchen_orders_v) > 0,
  'masking: kitchen reads orders via kitchen_orders_v');

select ok((select count(*) from public.kitchen_order_items_v) > 0,
  'masking: kitchen reads order items via kitchen_order_items_v');

-- ----------------------------------------------------------------------------
-- Back to the service context (postgres, no JWT)
-- ----------------------------------------------------------------------------
reset role;
set local request.jwt.claims to '{}';

select is(
  (with u as (
     update public.orders set status = 'cancelled'
     where id = 'eeeeeeee-0000-0000-0000-000000000003'
     returning 1)
   select count(*)::int from u),
  1,
  'guard: service context (no JWT, postgres) skips role enforcement');

select is(
  (select count(*)::int from public.audit_log
   where action = 'order.create'
     and entity_type = 'order'
     and entity_id = (select r->>'id' from p2_r1)
     and actor_user_id = 'dddddddd-0000-0000-0000-000000000001'),
  1,
  'audit: create_order wrote an order.create row with the acting staff member');

select is(
  (select count(*)::int from public.audit_log
   where action = 'order.status'
     and entity_type = 'order'
     and entity_id = 'eeeeeeee-0000-0000-0000-000000000001'
     and before_data->>'status' = 'confirmed'
     and after_data->>'status'  = 'ready'),
  1,
  'audit: the guard wrote an order.status row (confirmed -> ready)');

select columns_are('public', 'kitchen_orders_v',
  array['id', 'order_number', 'order_type', 'pickup_day', 'pickup_window', 'status', 'notes'],
  'kitchen_orders_v exposes NO money columns');

select columns_are('public', 'kitchen_order_items_v',
  array['id', 'order_id', 'product_id', 'product_name_snapshot', 'quantity', 'notes'],
  'kitchen_order_items_v exposes NO money columns');

select ok(
  (select coalesce(array_to_string(c.reloptions, ','), '') not like '%security_invoker=on%'
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'kitchen_orders_v'),
  'kitchen_orders_v is owner-based (security_invoker dropped)');

select ok(
  not exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'orders'
                and policyname = 'orders_kitchen_select'),
  'policy orders_kitchen_select was dropped');

select ok(
  not exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'orders'
                and policyname = 'orders_kitchen_update'),
  'policy orders_kitchen_update was dropped (status writes go through the view)');

select ok(
  not exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'order_items'
                and policyname = 'order_items_kitchen_select'),
  'policy order_items_kitchen_select was dropped');

select * from finish();
rollback;
