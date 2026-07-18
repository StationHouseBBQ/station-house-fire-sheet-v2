# Database Schema — Phase 1 Foundation

Source of truth: `supabase/migrations/0001_phase1_foundation.sql`.
This document is derived from that file; if they disagree, the migration wins.

## Conventions

* `uuid` primary keys, `default gen_random_uuid()` (except `profiles`, keyed
  to `auth.users`, and `audit_log`, bigint identity).
* `timestamptz` `created_at` / `updated_at` defaulting to `now()`; every
  table carrying `updated_at` has a `BEFORE UPDATE` touch trigger
  (`public.set_updated_at()`).
* **All money is integer cents** with `CHECK (>= 0)`.
* **Deny-by-default RLS** on every table; `anon` has all grants revoked.

## Enums

| Enum | Values |
|---|---|
| `staff_role` | `owner`, `manager`, `counter`, `kitchen`, `catering`, `marketing` |
| `order_type` | `fire_drop`, `seminole_preorder`, `catering`, `walk_in` |
| `order_status` | `draft`, `pending`, `confirmed`, `in_production`, `ready`, `picked_up`, `cancelled` |
| `payment_status` | `unpaid`, `pending`, `paid`, `partially_refunded`, `refunded`, `failed` |
| `lead_stage` | `new_lead`, `contacted`, `quote_sent`, `follow_up`, `booked`, `lost` |

## Tables

### profiles — one row per staff member

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | references `auth.users(id)` on delete cascade |
| `full_name` | text | nullable |
| `email` | text | nullable |
| `role` | `staff_role` | not null, default `'counter'` |
| `active` | boolean | not null, default `true` — inactive staff lose all access (`current_staff_role()` returns NULL) |
| `created_at` / `updated_at` | timestamptz | not null, default `now()`; touch trigger `trg_profiles_updated_at` |

### customers

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | default `gen_random_uuid()` |
| `full_name` | text | not null |
| `phone` | text | nullable |
| `email` | text | nullable |
| `created_at` / `updated_at` | timestamptz | touch trigger `trg_customers_updated_at` |

Constraints: `customers_contact_required` — `CHECK (phone is not null or email is not null)`.
Indexes: `customers_email_lower_idx` on `lower(email)`; `customers_phone_idx` on `phone`.

### products

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `sku` | text | **unique**, not null |
| `name` | text | not null |
| `description` | text | nullable |
| `category` | text | not null |
| `price_cents` | integer | not null, `CHECK (price_cents >= 0)` |
| `production_unit` | text | nullable (e.g. `lb`, `each`) |
| `active` | boolean | not null, default `true` |
| `sort_order` | integer | not null, default `0` |
| `created_at` / `updated_at` | timestamptz | touch trigger `trg_products_updated_at` |

Indexes: `products_category_sort_idx` on `(category, sort_order)`.

### orders

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `order_number` | text | **unique**, not null — filled by trigger when omitted (see below) |
| `customer_id` | uuid | references `customers(id)`, nullable |
| `order_type` | `order_type` | not null |
| `pickup_day` | date | nullable |
| `pickup_window` | text | nullable |
| `status` | `order_status` | not null, default `'draft'` |
| `payment_status` | `payment_status` | not null, default `'unpaid'` |
| `subtotal_cents` | integer | not null, default 0, `CHECK (>= 0)` |
| `tax_cents` | integer | not null, default 0, `CHECK (>= 0)` |
| `tip_cents` | integer | not null, default 0, `CHECK (>= 0)` |
| `total_cents` | integer | not null, default 0, `CHECK (>= 0)` |
| `notes` | text | nullable |
| `created_at` / `updated_at` | timestamptz | touch trigger `trg_orders_updated_at` |
| `completed_at` | timestamptz | nullable — set when picked up |

Constraints: `orders_total_matches` —
`CHECK (total_cents = subtotal_cents + tax_cents + tip_cents)`.
Indexes: `orders_status_pickup_day_idx (status, pickup_day)`,
`orders_order_type_idx (order_type)`, `orders_customer_id_idx (customer_id)`,
`orders_created_at_idx (created_at)`.

### order_items

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `order_id` | uuid | not null, references `orders(id)` **on delete cascade** |
| `product_id` | uuid | references `products(id)`, nullable (survives product deletion) |
| `product_name_snapshot` | text | not null — name at time of sale |
| `unit_price_cents` | integer | not null, `CHECK (>= 0)` — price at time of sale |
| `quantity` | integer | not null, `CHECK (quantity > 0)` |
| `line_total_cents` | integer | not null, `CHECK (>= 0)` |
| `notes` | text | nullable |
| `created_at` / `updated_at` | timestamptz | touch trigger `trg_order_items_updated_at` |

Constraints: `order_items_line_total_matches` —
`CHECK (line_total_cents = unit_price_cents * quantity)`.
Indexes: `order_items_order_id_idx (order_id)`.

### catering_leads

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `customer_id` | uuid | references `customers(id)`, nullable |
| `contact_name` | text | not null |
| `company_name` | text | nullable |
| `event_description` | text | nullable |
| `estimated_value_cents` | integer | nullable, `CHECK (>= 0)` |
| `source` | text | not null, default `'direct'` |
| `stage` | `lead_stage` | not null, default `'new_lead'` |
| `event_date` | date | nullable |
| `guest_count` | integer | nullable, `CHECK (guest_count > 0)` |
| `notes` | text | nullable |
| `created_at` / `updated_at` | timestamptz | touch trigger `trg_catering_leads_updated_at` |

Indexes: `catering_leads_stage_idx (stage)`, `catering_leads_event_date_idx (event_date)`.

### audit_log — append-only (no `updated_at` by design)

| Column | Type | Notes |
|---|---|---|
| `id` | bigint | `generated always as identity` PK |
| `actor_user_id` | uuid | references `auth.users(id)`, nullable |
| `entity_type` | text | not null (e.g. `order`, `catering_lead`) |
| `entity_id` | text | not null |
| `action` | text | not null (e.g. `status:ready->picked_up`) |
| `before_data` / `after_data` | jsonb | nullable |
| `created_at` | timestamptz | not null, default `now()` |

Indexes: `audit_log_entity_idx (entity_type, entity_id)`, `audit_log_created_at_idx (created_at)`.

### order_number_counters — per-day, per-prefix counters

| Column | Type | Notes |
|---|---|---|
| `day` | date | PK part |
| `prefix` | text | PK part |
| `counter` | integer | not null, default 0 |

All non-owner access flows through `next_order_number()` (SECURITY DEFINER).

## Functions and triggers

| Object | Kind | Purpose |
|---|---|---|
| `set_updated_at()` | trigger fn | touches `updated_at := now()` before update; attached to all six updated_at tables |
| `next_order_number(order_type)` | fn, SECURITY DEFINER | concurrency-safe order numbers: UPSERT on `order_number_counters` serializes on `(day, prefix)`; returns e.g. `FD-20260718-1042` (`1000 + counter`); day computed in **America/New_York**, not UTC. Prefixes: `FD` fire_drop, `SP` seminole_preorder, `CT` catering, `WI` walk_in. EXECUTE revoked from `public`/`anon`, granted to `authenticated`/`service_role`. UNIQUE on `orders.order_number` is the final collision backstop |
| `orders_fill_order_number()` + `trg_orders_fill_order_number` | BEFORE INSERT trigger | fills `order_number` via `next_order_number()` when the caller supplied NULL/omitted it |
| `current_staff_role()` | fn, STABLE SECURITY DEFINER | role of the calling user from `profiles`, NULL if unauthenticated/missing/inactive. (Spec called it `current_role()` — that is a reserved SQL keyword, hence the rename.) |
| `is_owner()` / `is_staff()` | fns, STABLE SECURITY DEFINER | policy helpers |

## Views

* `kitchen_orders_v` (`security_invoker = on`) — production fields only, **no
  money columns**: `id`, `order_number`, `order_type`, `pickup_day`,
  `pickup_window`, `status`, `notes`. The sanctioned kitchen read path;
  Phase 2 makes it kitchen's *only* read path via column masking.

## Row Level Security (deny by default)

RLS is enabled on all eight tables. `anon` has **all table and sequence
grants revoked** — an unauthenticated client gets nothing at all.
`authenticated` has blanket grants, gated entirely by these policies:

| Table | owner | manager | counter | kitchen | catering | marketing |
|---|---|---|---|---|---|---|
| profiles | ALL | SELECT | self-row SELECT | self-row SELECT | self-row SELECT | self-row SELECT |
| customers | ALL | ALL | SELECT + INSERT | — | ALL | — |
| products | ALL | ALL | SELECT | — | — | SELECT |
| orders | ALL | ALL | SELECT + INSERT + UPDATE¹ | SELECT² + UPDATE¹ | SELECT (catering orders only) | — |
| order_items | ALL | ALL | SELECT + INSERT | SELECT | SELECT (items of catering orders) | — |
| catering_leads | ALL | ALL | — | — | ALL | SELECT |
| audit_log | ALL | SELECT | INSERT³ | INSERT³ | INSERT³ | INSERT³ |
| order_number_counters | ALL | — (via `next_order_number()` only) | ″ | ″ | ″ | ″ |

¹ Update policies cannot restrict columns in Postgres; intended scope is
status transitions only, enforced app-side in Phase 1. Phase 2 lands a DB
transition-guard trigger and kitchen column masking.
² Kitchen base-table SELECT still exposes money columns in Phase 1;
`kitchen_orders_v` is the sanctioned path (see roles-and-permissions.md).
³ `audit_log_staff_insert`: any active staff member may append audit rows.
