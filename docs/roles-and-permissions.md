# Roles and Permissions — Phase 1

Six staff roles (`public.staff_role` enum), one per `profiles` row. A user
with no profile row — or an **inactive** profile — has **no role** and every
policy denies them. Unauthenticated (`anon`) clients have all grants revoked
outright.

## Core principle: RLS, not hidden buttons

Permissions are enforced **in the database with Row Level Security**, never
by hiding UI. Hiding a button is a courtesy; the policy is the security
boundary. Anyone who bypasses the UI (curl, devtools, a stolen build) hits
exactly the same deny-by-default policies. Consequently:

* the UI may show a control the DB will reject — the request fails loudly;
* adding a UI affordance never grants access;
* every permission claim below is testable in SQL (see
  `supabase/tests/rls_role_tests.sql`).

## Role matrix

### owner
* **Can:** everything on every table — including the only write path to
  `profiles` (role management) and full access to `audit_log` and
  `order_number_counters`.
* **Cannot:** nothing is restricted at the DB layer. (Operationally: owner
  actions still land in `audit_log` when they flow through the app.)

### manager
* **Can:** full CRUD on `customers`, `products`, `orders`, `order_items`,
  `catering_leads`; read all `profiles`; read `audit_log`.
* **Cannot:** manage roles or staff (`profiles` is read-only — no INSERT/
  UPDATE/DELETE); write to `audit_log` beyond the staff append policy;
  touch `order_number_counters` directly.

### counter (FOH)
* **Can:** read `products` and `customers`; create `customers` and `orders`
  + `order_items` (walk-ins); update `orders` (intended scope: status
  transitions to `ready`/`picked_up`); read own profile; append audit rows.
* **Cannot:** see other staff profiles; touch `catering_leads`; edit
  `products`; read `audit_log`; delete anything.
* Note: Postgres UPDATE policies cannot restrict columns, so in Phase 1 the
  transition-only intent is enforced app-side; Phase 2 adds a DB
  transition-guard trigger.

### kitchen
* **Can:** read orders and `order_items` for production; update `orders`
  (intended scope: `in_production`/`ready` status only); read own profile;
  append audit rows. The **sanctioned read path is `kitchen_orders_v`** —
  production fields only.
* **Cannot:** see `customers`, `products` pricing admin, `catering_leads`,
  `audit_log`; create or delete orders.
* **Money-masking note:** the kitchen station should never display money.
  `kitchen_orders_v` contains **no money columns** (`subtotal_cents`,
  `tax_cents`, `tip_cents`, `total_cents` are excluded). In Phase 1 kitchen
  *technically* retains base-table SELECT on `orders` (money columns
  visible to a hand-written query); Phase 2 hardens this with column-level
  masking so the view becomes kitchen's only read path. UI must use the
  view today — that's the RLS-not-hidden-buttons principle applied in the
  one place Phase 1 can't yet fully enforce it.

### catering
* **Can:** full CRUD on `catering_leads` and `customers`; read `orders` /
  `order_items` **only where `order_type = 'catering'`**; read own profile;
  append audit rows.
* **Cannot:** see non-catering orders (fire drop, walk-in, seminole);
  touch `products`; read `audit_log`; manage staff.

### marketing
* **Can:** read `products` and `catering_leads` (campaign/attribution
  visibility); read own profile; append audit rows.
* **Cannot:** write anything except audit appends; see `customers`,
  `orders`, or `order_items` at all — no PII, no revenue detail.

## Shared rules

* Every role: SELECT on own `profiles` row; INSERT on `audit_log`
  (append-only — nobody except owner can read/modify it besides manager
  read).
* `order_number_counters` is reachable only through the SECURITY DEFINER
  function `next_order_number()` (plus owner direct access).
* Deactivating a profile (`active = false`) revokes everything instantly:
  `current_staff_role()` returns NULL and all policies fail.
