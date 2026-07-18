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
