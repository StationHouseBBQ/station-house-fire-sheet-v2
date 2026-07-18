-- ============================================================================
-- Station House Fire Sheet V2 — Phase 1 pgTAP suite
-- File: supabase/tests/phase1_tests.sql
--
-- HOW TO RUN (local Supabase stack):
--   1. supabase start
--   2. supabase db reset
--        (applies supabase/migrations/*; ensure supabase/seed/seed.sql is
--         listed in config.toml [db.seed] sql_paths, or load it manually:)
--      psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -v ON_ERROR_STOP=1 -f supabase/seed/seed.sql
--   3. psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -v ON_ERROR_STOP=1 -f supabase/tests/phase1_tests.sql
--
-- Requires the seed to be loaded (row-count and updated_at tests).
-- Everything runs in one transaction and rolls back — no state is left behind.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set search_path to public, extensions;

select plan(41);

-- ----------------------------------------------------------------------------
-- Schema: tables exist
-- ----------------------------------------------------------------------------
select has_table('public', 'profiles',              'profiles table exists');
select has_table('public', 'customers',             'customers table exists');
select has_table('public', 'products',              'products table exists');
select has_table('public', 'orders',                'orders table exists');
select has_table('public', 'order_items',           'order_items table exists');
select has_table('public', 'catering_leads',        'catering_leads table exists');
select has_table('public', 'audit_log',             'audit_log table exists');
select has_table('public', 'order_number_counters', 'order_number_counters table exists');

-- ----------------------------------------------------------------------------
-- Schema: enums exist
-- ----------------------------------------------------------------------------
select has_enum('public', 'staff_role',     'staff_role enum exists');
select has_enum('public', 'order_type',     'order_type enum exists');
select has_enum('public', 'order_status',   'order_status enum exists');
select has_enum('public', 'payment_status', 'payment_status enum exists');
select has_enum('public', 'lead_stage',     'lead_stage enum exists');

-- ----------------------------------------------------------------------------
-- RLS is enabled on every table
-- ----------------------------------------------------------------------------
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'profiles'),              'RLS enabled: profiles');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'customers'),             'RLS enabled: customers');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'products'),              'RLS enabled: products');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'orders'),                'RLS enabled: orders');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'order_items'),           'RLS enabled: order_items');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'catering_leads'),        'RLS enabled: catering_leads');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'audit_log'),             'RLS enabled: audit_log');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'order_number_counters'), 'RLS enabled: order_number_counters');

-- ----------------------------------------------------------------------------
-- Seed loaded
-- ----------------------------------------------------------------------------
select is((select count(*)::int from public.products),        8,  'seed: exactly 8 products');
select ok((select count(*) from public.customers)      >= 4,      'seed: at least 4 customers');
select ok((select count(*) from public.orders)         >= 4,      'seed: at least 4 orders');
select ok((select count(*) from public.order_items)    >= 8,      'seed: at least 8 order items');
select ok((select count(*) from public.catering_leads) >= 6,      'seed: at least 6 catering leads');

-- ----------------------------------------------------------------------------
-- Constraint enforcement
-- ----------------------------------------------------------------------------

-- scratch order used by several tests
select lives_ok(
  $$insert into public.orders (id, order_number, order_type)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'TEST-DUP-0001', 'walk_in')$$,
  'scratch order inserts cleanly');

select throws_ok(
  $$insert into public.orders (order_number, order_type)
    values ('TEST-DUP-0001', 'walk_in')$$,
  '23505',
  'duplicate order_number is rejected (unique violation)');

select throws_ok(
  $$insert into public.order_items (order_id, product_name_snapshot, unit_price_cents, quantity, line_total_cents)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'Bad Qty', 100, -1, -100)$$,
  '23514',
  'negative quantity is rejected (check violation)');

select throws_ok(
  $$insert into public.products (sku, name, category, price_cents)
    values ('NEG-TEST', 'Negative Price', 'Test', -1)$$,
  '23514',
  'negative product price is rejected (check violation)');

select throws_ok(
  $$insert into public.order_items (order_id, product_name_snapshot, unit_price_cents, quantity, line_total_cents)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'Bad Price', -5, 1, -5)$$,
  '23514',
  'negative unit price is rejected (check violation)');

select throws_ok(
  $$update public.orders set status = 'bogus' where false$$,
  '22P02',
  'invalid status value is rejected (enum)');

select throws_ok(
  $$insert into public.order_items (order_id, product_name_snapshot, unit_price_cents, quantity, line_total_cents)
    values ('99999999-9999-9999-9999-999999999999', 'Orphan', 100, 1, 100)$$,
  '23503',
  'orphaned order_items are rejected (fk violation)');

select throws_ok(
  $$insert into public.orders (order_number, order_type, subtotal_cents, tax_cents, tip_cents, total_cents)
    values ('TEST-BAD-TOTAL', 'walk_in', 100, 0, 0, 999)$$,
  '23514',
  'total_cents must equal subtotal + tax + tip (check violation)');

select lives_ok(
  $$with o as (
      insert into public.orders (order_number, order_type, subtotal_cents, tax_cents, tip_cents, total_cents)
      values ('TEST-OK-0001', 'walk_in', 2400, 180, 0, 2580)
      returning id
    )
    insert into public.order_items (order_id, product_id, product_name_snapshot, unit_price_cents, quantity, line_total_cents)
    select o.id, (select id from public.products where sku = 'MAC-PT'), 'Mac & Cheese — Pint', 1200, 2, 2400
    from o$$,
  'valid order + items with correct totals inserts cleanly');

-- ----------------------------------------------------------------------------
-- updated_at touch trigger (uses a seeded row so created_at predates this txn)
-- ----------------------------------------------------------------------------
update public.products set name = name where sku = 'TD-LB';
select ok(
  (select updated_at > created_at from public.products where sku = 'TD-LB'),
  'updated_at touch trigger fires on update');

-- ----------------------------------------------------------------------------
-- next_order_number: unique, sequential, well-formed under repeated calls
-- ----------------------------------------------------------------------------
create temp table _nums on commit drop as
  select public.next_order_number('walk_in') as n
  from generate_series(1, 5);

select is((select count(distinct n)::int from _nums), 5,
  'next_order_number: 5 calls produce 5 unique numbers');

select is(
  (select max(split_part(n, '-', 3)::int) - min(split_part(n, '-', 3)::int) from _nums),
  4,
  'next_order_number: counters are sequential');

select is((select count(*)::int from _nums where n ~ '^WI-\d{8}-\d{4,}$'), 5,
  'next_order_number: format is WI-YYYYMMDD-1xxx');

-- ----------------------------------------------------------------------------
-- RLS: anon is blocked outright (privileges revoked; no policies)
-- ----------------------------------------------------------------------------
set local role anon;

select throws_ok(
  $$select count(*) from public.products$$,
  '42501',
  'anon cannot read products');

select throws_ok(
  $$select count(*) from public.orders$$,
  '42501',
  'anon cannot read orders');

reset role;

select * from finish();
rollback;
