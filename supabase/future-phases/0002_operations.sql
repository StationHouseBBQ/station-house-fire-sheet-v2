-- Station House Fire Sheet V2 — operations schema (KDS, checklists, pit, retail,
-- preorders, packing, catering ops, marketing, admin, weekly advance).
-- Extends 0001_core.sql. Same conventions: bigint identity PKs, uuid public
-- tokens, money = integer cents, timestamptz, business time America/New_York,
-- deny-by-default RLS with owner_admin full access + per-role policies
-- (docs/ARCHITECTURE.md §5).

-- ── Enums ────────────────────────────────────────────────────────────────
create type kds_stage as enum ('kitchen','expo','ready','handed_off');
create type retail_item_status as enum ('queued','firing','in_case','sold_out_86');
create type preorder_channel as enum ('fire_drop','cuban_thursday');
create type preorder_status as enum ('pending','paid','ready','picked_up','cancelled','refunded');
create type drop_day as enum ('friday','saturday');
create type delivery_status as enum ('assigned','loaded','en_route','delivered');
create type quote_kind as enum ('quote','invoice');
create type quote_status as enum ('draft','sent','accepted','declined','invoiced','paid');
create type portal_order_status as enum ('pending_approval','approved','rejected','changes_requested','invoiced','paid');
create type discount_kind as enum ('percent','fixed_cents');
create type media_kind as enum ('photo','video','graphic');
create type post_status as enum ('idea','drafted','scheduled','posted');
create type outreach_stage as enum ('identified','contacted','responded','meeting','won','lost');
create type campaign_status as enum ('active','paused','ended');
create type brief_kind as enum ('content','design','video','ads');
create type brief_status as enum ('queued','in_review','approved','done');
create type import_status as enum ('queued','needs_review','imported','failed');
create type lead_priority as enum ('low','normal','high','urgent');

-- ── Column additions to 0001 tables ──────────────────────────────────────
-- menu_items.thursday_only already exists (0001); add sizing/unit metadata.
alter table menu_items add column size_options text,
                       add column unit text;
alter table companies  add column industry text,
                       add column portal_enabled boolean not null default false,
                       add column notes text;
alter table contacts   add column tags text[] not null default '{}',
                       add column notes text;
alter table leads      add column priority lead_priority not null default 'normal',
                       add column source text;

-- ── KDS ──────────────────────────────────────────────────────────────────
create table kds_tickets (
  id bigint generated always as identity primary key,
  order_id bigint references orders(id) on delete cascade,
  preorder_id bigint,                       -- fk added after preorders below
  order_ref text not null,
  customer text not null,
  service_date date not null,
  time_window text,
  stage kds_stage not null default 'kitchen',
  fired_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id)
);
create table kds_ticket_items (
  id bigint generated always as identity primary key,
  ticket_id bigint not null references kds_tickets(id) on delete cascade,
  order_item_id bigint references order_items(id),
  name text not null,
  qty numeric not null check (qty > 0),
  unit text not null default 'ea',
  kitchen_checked boolean not null default false,
  expo_checked boolean not null default false
);
create index kds_tickets_date_idx on kds_tickets (service_date, stage);

-- ── Checklists (kitchen morning / FOH / manager sign-off) ────────────────
create table checklist_templates (
  id bigint generated always as identity primary key,
  name text not null,
  workspace text not null,                  -- kitchen | seminole | pit …
  active boolean not null default true,
  sort_order int not null default 0
);
create table checklist_template_items (
  id bigint generated always as identity primary key,
  template_id bigint not null references checklist_templates(id) on delete cascade,
  label text not null,
  section text not null default 'general',
  sort_order int not null default 0
);
create table checklist_runs (
  id bigint generated always as identity primary key,
  template_id bigint not null references checklist_templates(id),
  run_date date not null,
  signed_off_by uuid references profiles(id),
  signed_off_at timestamptz,
  created_at timestamptz not null default now(),
  unique (template_id, run_date)
);
create table checklist_run_items (
  id bigint generated always as identity primary key,
  run_id bigint not null references checklist_runs(id) on delete cascade,
  template_item_id bigint references checklist_template_items(id),
  label text not null,
  section text not null default 'general',
  done boolean not null default false,
  done_by uuid references profiles(id),
  done_at timestamptz,
  sort_order int not null default 0
);

-- ── Prep recipes ─────────────────────────────────────────────────────────
create table prep_recipes (
  id bigint generated always as identity primary key,
  name text not null,
  category text not null,                   -- meats | sauces | sides | retail_prep | misc | desserts
  yield_qty numeric not null default 0,
  yield_unit text not null default 'ea',
  steps text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id)
);
create table prep_recipe_ingredients (
  id bigint generated always as identity primary key,
  recipe_id bigint not null references prep_recipes(id) on delete cascade,
  name text not null,
  qty numeric not null check (qty >= 0),
  unit text not null,
  sort_order int not null default 0
);

-- ── Pit: smoker forecast / smoked inventory / pitmaster guide / costs ────
create table smoker_entries (
  id bigint generated always as identity primary key,
  entry_date date not null,
  protein text not null,
  raw_lbs numeric not null check (raw_lbs >= 0),
  smoker text not null,
  load_time text not null,                  -- e.g. "9:00 PM"
  target_done text not null,                -- e.g. "10:30 AM"
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id)
);
create index smoker_entries_date_idx on smoker_entries (entry_date);
create table smoke_batches (
  id bigint generated always as identity primary key,
  batch_date date not null,
  protein text not null,
  raw_lbs numeric not null check (raw_lbs >= 0),
  cooked_lbs numeric not null check (cooked_lbs >= 0),
  smoker text not null,
  logged_by uuid references profiles(id),
  logged_at timestamptz not null default now()
);
create table pitmaster_proteins (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  target_internal_f int not null,
  smoker_temp_f int not null,
  est_hours_per_lb numeric not null default 0,
  rest_min int not null default 0,
  woods text,
  sort_order int not null default 0
);
create table pitmaster_steps (
  id bigint generated always as identity primary key,
  protein_id bigint not null references pitmaster_proteins(id) on delete cascade,
  step_order int not null default 0,
  title text not null,
  detail text,
  temp_f int,
  duration_min int
);
create table meat_costs (
  id bigint generated always as identity primary key,
  protein text not null,
  vendor text not null,
  cost_per_lb_cents bigint not null check (cost_per_lb_cents >= 0),
  case_lbs numeric not null default 0,
  yield_pct numeric not null default 0 check (yield_pct >= 0 and yield_pct <= 100),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);
create table pit_checklist_runs (
  id bigint generated always as identity primary key,
  run_date date not null unique,
  created_at timestamptz not null default now()
);
create table pit_tasks (
  id bigint generated always as identity primary key,
  run_id bigint not null references pit_checklist_runs(id) on delete cascade,
  label text not null,
  protein text,
  target_lbs numeric,
  done boolean not null default false,
  done_by uuid references profiles(id),
  done_at timestamptz,
  sort_order int not null default 0
);

-- ── Retail daily fire sheet (Seminole) ───────────────────────────────────
create table retail_sessions (
  id bigint generated always as identity primary key,
  service_date date not null unique,
  submitted_to_kitchen_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);
create table retail_fire_items (
  id bigint generated always as identity primary key,
  session_id bigint not null references retail_sessions(id) on delete cascade,
  name text not null,
  unit text not null default 'ea',
  qty numeric not null default 0 check (qty >= 0),
  status retail_item_status not null default 'queued',
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);

-- ── Temp log ─────────────────────────────────────────────────────────────
create table temp_stations (
  id bigint generated always as identity primary key,
  name text not null unique,
  min_f numeric,
  max_f numeric,
  note text,
  sort_order int not null default 0
);
create table temp_checks (
  id bigint generated always as identity primary key,
  station text not null,
  temp_f numeric not null,
  within_range boolean not null,
  range_note text,
  taken_by uuid references profiles(id),
  taken_at timestamptz not null default now()
);
create index temp_checks_at_idx on temp_checks (taken_at);

-- ── Fire Drop slots (0001 has fire_drops + fire_drop_products, incl.
--    fire_drops.sold_out and per-product cap_qty/sold_qty/sold_out) ───────
create table fire_drop_slots (
  id bigint generated always as identity primary key,
  drop_id bigint not null references fire_drops(id) on delete cascade,
  day drop_day not null,
  pickup_window text not null,              -- e.g. "4:00–5:00 PM"
  capacity int not null check (capacity >= 0),
  booked int not null default 0 check (booked >= 0),
  sort_order int not null default 0,
  unique (drop_id, day, pickup_window)
);

-- ── Preorders (Fire Drop + Cuban Thursday customer orders) ───────────────
create table preorders (
  id bigint generated always as identity primary key,
  order_ref text not null unique,           -- immutable public reference
  public_token uuid not null default gen_random_uuid() unique,
  checkout_attempt_id uuid unique references checkout_attempts(id),
  channel preorder_channel not null,
  customer_name text not null,
  phone text not null default '',
  email text not null default '',
  pickup_date date not null,
  pickup_window text not null,
  slot_id bigint references fire_drop_slots(id),
  subtotal_cents bigint not null check (subtotal_cents >= 0),
  tax_cents bigint not null check (tax_cents >= 0),
  total_cents bigint not null check (total_cents >= 0),
  status preorder_status not null default 'pending',
  hidden boolean not null default false,
  square_payment_id text,
  utm_source text, utm_medium text, utm_campaign text, utm_term text, utm_content text,
  gclid text, fbclid text, referrer text, landing_page text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id)
);
create table preorder_items (
  id bigint generated always as identity primary key,
  preorder_id bigint not null references preorders(id) on delete cascade,
  fire_drop_product_id bigint references fire_drop_products(id),
  menu_item_id bigint references menu_items(id),
  name_snapshot text not null,
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  qty int not null check (qty > 0),
  line_total_cents bigint not null check (line_total_cents >= 0)
);
create table preorder_status_history (
  id bigint generated always as identity primary key,
  preorder_id bigint not null references preorders(id) on delete cascade,
  from_status preorder_status,
  to_status preorder_status not null,
  actor uuid references profiles(id),
  actor_label text,                         -- 'public-checkout' | 'square-webhook' when no auth user
  at timestamptz not null default now()
);
alter table kds_tickets
  add constraint kds_tickets_preorder_fk foreign key (preorder_id) references preorders(id) on delete cascade;

-- ── Packing ──────────────────────────────────────────────────────────────
create table pack_jobs (
  id bigint generated always as identity primary key,
  order_id bigint references orders(id) on delete cascade,
  preorder_id bigint references preorders(id) on delete cascade,
  order_ref text not null,
  customer text not null,
  service_date date not null,
  time_window text,
  channel text not null,
  packed_at timestamptz,
  packed_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  check (order_id is not null or preorder_id is not null)
);
create table pack_checklist_items (
  id bigint generated always as identity primary key,
  job_id bigint not null references pack_jobs(id) on delete cascade,
  label text not null,
  done boolean not null default false,
  done_by uuid references profiles(id),
  done_at timestamptz,
  sort_order int not null default 0
);
create table supply_items (
  id bigint generated always as identity primary key,
  name text not null,
  unit text not null default 'ea',
  on_hand numeric not null default 0 check (on_hand >= 0),
  par_level numeric not null default 0,
  per_order_usage numeric not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);
create table deliveries (
  id bigint generated always as identity primary key,
  order_id bigint references orders(id) on delete cascade,
  preorder_id bigint references preorders(id) on delete cascade,
  order_ref text not null,
  customer text not null,
  address text not null,
  service_date date not null,
  time_window text,
  driver text,
  status delivery_status not null default 'assigned',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id),
  check (order_id is not null or preorder_id is not null)
);

-- ── Catering: quotes / venues / equipment / portal ───────────────────────
create table quotes (
  id bigint generated always as identity primary key,
  quote_ref text not null unique,
  public_token uuid not null default gen_random_uuid() unique,  -- token-addressed accept flow
  kind quote_kind not null default 'quote',
  lead_id bigint references leads(id),
  customer text not null,
  event_date date,
  subtotal_cents bigint not null default 0 check (subtotal_cents >= 0),
  tax_cents bigint not null default 0 check (tax_cents >= 0),
  total_cents bigint not null default 0 check (total_cents >= 0),
  status quote_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id)
);
create table quote_lines (
  id bigint generated always as identity primary key,
  quote_id bigint not null references quotes(id) on delete cascade,
  name text not null,
  qty int not null check (qty > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  line_total_cents bigint not null check (line_total_cents >= 0),
  sort_order int not null default 0
);
create table venues (
  id bigint generated always as identity primary key,
  name text not null,
  address text not null default '',
  contact_name text not null default '',
  phone text not null default '',
  capacity int,
  load_in_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id)
);
create table equipment_items (
  id bigint generated always as identity primary key,
  name text not null,
  category text not null default 'general',
  qty_owned int not null default 0 check (qty_owned >= 0),
  per_guest_ratio numeric,
  notes text
);
create table portal_orders (
  id bigint generated always as identity primary key,
  ref text not null unique,
  company_id bigint not null references companies(id),
  requested_by text not null,
  event_date date not null,
  subtotal_cents bigint not null check (subtotal_cents >= 0),
  tax_cents bigint not null check (tax_cents >= 0),
  total_cents bigint not null check (total_cents >= 0),
  status portal_order_status not null default 'pending_approval',
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id)
);
create table portal_order_items (
  id bigint generated always as identity primary key,
  portal_order_id bigint not null references portal_orders(id) on delete cascade,
  name text not null,
  qty int not null check (qty > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  line_total_cents bigint not null check (line_total_cents >= 0)
);

-- ── Marketing ────────────────────────────────────────────────────────────
create table landing_pages (
  id bigint generated always as identity primary key,
  slug text not null unique,
  title text not null,
  kind text not null default 'general',
  status text not null default 'draft' check (status in ('live','draft')),
  visits int not null default 0,
  conversions int not null default 0,
  updated_at timestamptz not null default now()
);
create table content_posts (
  id bigint generated always as identity primary key,
  post_date date not null,
  platform text not null,
  title text not null,
  body text not null default '',
  status post_status not null default 'idea',
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);
create table media_assets (
  id bigint generated always as identity primary key,
  name text not null,
  kind media_kind not null,
  tags text[] not null default '{}',
  storage_path text,                        -- Supabase Storage object path
  added_at timestamptz not null default now(),
  added_by uuid references profiles(id)
);
create table outreach_targets (
  id bigint generated always as identity primary key,
  business text not null,
  contact text not null default '',
  email text not null default '',
  stage outreach_stage not null default 'identified',
  last_touch date,
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);
create table perf_rows (
  id bigint generated always as identity primary key,
  platform text not null,
  metric text not null,
  value numeric not null default 0,
  period text not null                      -- e.g. "2026-07" | "2026-W29"
);
create table ad_campaigns (
  id bigint generated always as identity primary key,
  platform text not null,
  name text not null,
  status campaign_status not null default 'active',
  spend_cents bigint not null default 0 check (spend_cents >= 0),
  leads int not null default 0,
  cost_per_lead_cents bigint not null default 0,
  updated_at timestamptz not null default now()
);
create table creative_briefs (
  id bigint generated always as identity primary key,
  kind brief_kind not null,
  title text not null,
  brief text not null default '',
  status brief_status not null default 'queued',
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

-- ── Admin ────────────────────────────────────────────────────────────────
-- App users piggyback on profiles + user_roles (0001) — no new table.
create table discount_codes (
  id bigint generated always as identity primary key,
  code text not null unique check (code = upper(code) and length(code) >= 3),
  kind discount_kind not null,
  value bigint not null,
  active boolean not null default true,
  used_count int not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  -- percent: whole percent 1–100; fixed_cents: positive cents
  check ((kind = 'percent' and value between 1 and 100)
      or (kind = 'fixed_cents' and value > 0))
);
create table special_events (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  landing_enabled boolean not null default false,
  ordering_enabled boolean not null default false,
  event_date date,
  menu_item_ids bigint[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);
create table order_guide_rows (
  id bigint generated always as identity primary key,
  item text not null,
  vendor text not null default '',
  unit text not null default 'case',
  par_qty numeric not null default 0,
  on_hand numeric not null default 0,
  order_qty numeric not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);
-- prep_templates exists in 0001 with name/category/unit/par_qty/thursday_only/active — no changes.
create table samplers (
  id bigint generated always as identity primary key,
  name text not null,
  price_cents bigint not null check (price_cents >= 0),
  active boolean not null default true
);
create table sampler_proteins (
  id bigint generated always as identity primary key,
  sampler_id bigint not null references samplers(id) on delete cascade,
  protein text not null,
  -- Owner rule: samplers may ONLY contain these five proteins.
  constraint sampler_protein_allowed check (protein in
    ('Pulled Pork','Brisket','Smoked Sausage','St. Louis Ribs','Chicken Quarters')),
  unique (sampler_id, protein)
);
create table settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);
create table import_jobs (
  id bigint generated always as identity primary key,
  source text not null,
  kind text not null,
  status import_status not null default 'queued',
  row_count int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);

-- ── updated_at triggers ──────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'kds_tickets','prep_recipes','smoker_entries','retail_fire_items','preorders',
    'deliveries','supply_items','quotes','venues','portal_orders','landing_pages',
    'content_posts','outreach_targets','ad_campaigns','special_events',
    'order_guide_rows','settings','meat_costs']
  loop execute format('create trigger %I_touch before update on %I for each row execute function touch_updated_at()', t, t);
  end loop;
end $$;

-- ── RLS: enable everywhere (deny-by-default) ─────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'kds_tickets','kds_ticket_items','checklist_templates','checklist_template_items',
    'checklist_runs','checklist_run_items','prep_recipes','prep_recipe_ingredients',
    'smoker_entries','smoke_batches','pitmaster_proteins','pitmaster_steps','meat_costs',
    'pit_checklist_runs','pit_tasks','retail_sessions','retail_fire_items',
    'temp_stations','temp_checks','fire_drop_slots','preorders','preorder_items',
    'preorder_status_history','pack_jobs','pack_checklist_items','supply_items','deliveries',
    'quotes','quote_lines','venues','equipment_items','portal_orders','portal_order_items',
    'landing_pages','content_posts','media_assets','outreach_targets','perf_rows',
    'ad_campaigns','creative_briefs','discount_codes','special_events','order_guide_rows',
    'samplers','sampler_proteins','settings','import_jobs']
  loop execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- owner_admin: full access on every new table
do $$
declare t text;
begin
  foreach t in array array[
    'kds_tickets','kds_ticket_items','checklist_templates','checklist_template_items',
    'checklist_runs','checklist_run_items','prep_recipes','prep_recipe_ingredients',
    'smoker_entries','smoke_batches','pitmaster_proteins','pitmaster_steps','meat_costs',
    'pit_checklist_runs','pit_tasks','retail_sessions','retail_fire_items',
    'temp_stations','temp_checks','fire_drop_slots','preorders','preorder_items',
    'preorder_status_history','pack_jobs','pack_checklist_items','supply_items','deliveries',
    'quotes','quote_lines','venues','equipment_items','portal_orders','portal_order_items',
    'landing_pages','content_posts','media_assets','outreach_targets','perf_rows',
    'ad_campaigns','creative_briefs','discount_codes','special_events','order_guide_rows',
    'samplers','sampler_proteins','settings','import_jobs']
  loop execute format('create policy %I_admin_all on %I for all using (is_admin()) with check (is_admin())', t, t);
  end loop;
end $$;

-- kitchen: KDS, checklists, prep recipes, pit tables (NO meat_costs — pricing
-- is hidden from kitchen per §5), retail fire sheet read.
do $$
declare t text;
begin
  foreach t in array array[
    'kds_tickets','kds_ticket_items','checklist_runs','checklist_run_items',
    'prep_recipes','prep_recipe_ingredients','smoker_entries','smoke_batches',
    'pitmaster_steps','pit_checklist_runs','pit_tasks']
  loop execute format('create policy %I_kitchen_all on %I for all using (has_role(''kitchen'')) with check (has_role(''kitchen''))', t, t);
  end loop;
end $$;
create policy checklist_templates_kitchen_r on checklist_templates for select using (has_role('kitchen'));
create policy checklist_template_items_kitchen_r on checklist_template_items for select using (has_role('kitchen'));
create policy pitmaster_proteins_kitchen_r on pitmaster_proteins for select using (has_role('kitchen'));
create policy retail_sessions_kitchen_r on retail_sessions for select using (has_role('kitchen'));
create policy retail_fire_items_kitchen_r on retail_fire_items for select using (has_role('kitchen'));

-- counter_foh: retail fire sheet, preorders, temp log, FOH checklists, KDS read, slots read.
do $$
declare t text;
begin
  foreach t in array array[
    'retail_sessions','retail_fire_items','preorders','preorder_items',
    'preorder_status_history','checklist_runs','checklist_run_items']
  loop execute format('create policy %I_foh_all on %I for all using (has_role(''counter_foh'')) with check (has_role(''counter_foh''))', t, t);
  end loop;
end $$;
create policy checklist_templates_foh_r on checklist_templates for select using (has_role('counter_foh'));
create policy checklist_template_items_foh_r on checklist_template_items for select using (has_role('counter_foh'));
create policy temp_stations_foh_r on temp_stations for select using (has_role('counter_foh'));
create policy temp_checks_foh_r on temp_checks for select using (has_role('counter_foh'));
create policy temp_checks_foh_i on temp_checks for insert with check (has_role('counter_foh'));
create policy kds_tickets_foh_r on kds_tickets for select using (has_role('counter_foh'));
create policy kds_ticket_items_foh_r on kds_ticket_items for select using (has_role('counter_foh'));
create policy fire_drop_slots_foh_r on fire_drop_slots for select using (has_role('counter_foh'));

-- packing: pack jobs / supplies / deliveries read-write; order detail reads.
do $$
declare t text;
begin
  foreach t in array array['pack_jobs','pack_checklist_items','supply_items','deliveries']
  loop execute format('create policy %I_pack_all on %I for all using (has_role(''packing'')) with check (has_role(''packing''))', t, t);
  end loop;
end $$;
create policy preorders_pack_r on preorders for select using (has_role('packing'));
create policy preorder_items_pack_r on preorder_items for select using (has_role('packing'));

-- catering_director: quotes, venues, equipment, portal, special events
-- (leads/contacts/companies/activities policies live in 0001).
do $$
declare t text;
begin
  foreach t in array array[
    'quotes','quote_lines','venues','equipment_items','portal_orders',
    'portal_order_items','special_events']
  loop execute format('create policy %I_dir_all on %I for all using (has_role(''catering_director'')) with check (has_role(''catering_director''))', t, t);
  end loop;
end $$;
create policy preorders_dir_r on preorders for select using (has_role('catering_director'));
create policy preorder_items_dir_r on preorder_items for select using (has_role('catering_director'));

-- Anonymous/public: NO direct table access. Public checkout, quote accept,
-- and order tracking flow through security-definer functions / Edge Functions
-- keyed by uuid tokens (0003_checkout_fn.sql).

-- ── Weekly Fire Drop advance (§7) ────────────────────────────────────────
-- Advances the drop window to next Fri/Sat: clones current drop's products
-- (sold counters reset) and slots (booked = 0), audits, and enqueues an
-- owner notification. Idempotent: re-running in the same week is a no-op.
create or replace function advance_fire_drop() returns void
language plpgsql security definer set search_path = public as
$$
declare
  cur fire_drops%rowtype;
  next_fri date;
  next_sat date;
  new_id bigint;
begin
  select * into cur from fire_drops order by friday_date desc limit 1;
  if not found then
    return;
  end if;
  next_fri := cur.friday_date + 7;
  next_sat := cur.saturday_date + 7;
  if exists (select 1 from fire_drops where friday_date = next_fri) then
    return; -- already advanced this week
  end if;

  insert into fire_drops (friday_date, saturday_date, title, sold_out)
  values (next_fri, next_sat, cur.title, false)
  returning id into new_id;

  -- carry products forward as the template; reset sold counters/flags
  insert into fire_drop_products (drop_id, menu_item_id, name, price_cents, cap_qty, sold_qty, sold_out, sort_order)
  select new_id, menu_item_id, name, price_cents, cap_qty, 0, false, sort_order
  from fire_drop_products where drop_id = cur.id;

  -- carry slots forward; reset booked = 0
  insert into fire_drop_slots (drop_id, day, pickup_window, capacity, booked, sort_order)
  select new_id, day, pickup_window, capacity, 0, sort_order
  from fire_drop_slots where drop_id = cur.id;

  insert into audit_log (actor, action, entity, entity_id, before, after)
  values (null, 'drop.advanced', 'fire_drops', new_id::text,
          jsonb_build_object('friday', cur.friday_date, 'saturday', cur.saturday_date),
          jsonb_build_object('friday', next_fri, 'saturday', next_sat));

  insert into notifications_outbox (event, payload)
  values ('drop.advanced',
          jsonb_build_object('drop_id', new_id, 'friday', next_fri, 'saturday', next_sat));
end
$$;
revoke all on function advance_fire_drop() from public;
revoke all on function advance_fire_drop() from anon;
revoke all on function advance_fire_drop() from authenticated;
grant execute on function advance_fire_drop() to service_role;

-- pg_cron: the extension must be enabled at provisioning (Dashboard →
-- Database → Extensions → pg_cron, or `create extension pg_cron;` as
-- superuser). pg_cron evaluates schedules in the cron.timezone GUC — set it
-- to America/New_York (`alter system set cron.timezone = 'America/New_York';
-- select pg_reload_conf();`) so '5 0 * * 1' fires Monday 00:05 ET.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('advance-fire-drop', '5 0 * * 1', 'select public.advance_fire_drop()');
  else
    raise notice 'pg_cron not installed: schedule advance_fire_drop() manually (Mon 00:05 America/New_York).';
  end if;
end $$;
