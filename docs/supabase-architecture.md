# Supabase Architecture — Station House Fire Sheet V2

**Status:** Phase 1 (staging foundation). Last updated 2026-07-18.

## The two-mode model

The app (`app/`) runs in one of two data modes, selected by `VITE_DATA_MODE`
at build/dev time:

| Mode | Backend | Who uses it |
|---|---|---|
| `demo` (default) | In-memory seeded collections behind the DAL (`app/src/dal/demo/`) | Everyone, all 72 tabs, GitHub Pages previews |
| `supabase` | Real Supabase project (Postgres + RLS) via `app/src/dal/supabase/` | Staging verification of Phase 1 |

The mode switch lives in `app/src/dal/index.ts` (`getDal()`), and every UI
module talks only to the `Dal` interface (`app/src/dal/types.ts`) — never to
an adapter or a database client directly.

**No silent fallback — ever.** In `supabase` mode:

* missing `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` → the adapter throws
  at startup with a clear message;
* an unreachable/failing database → the `phase1` repository methods throw
  descriptive errors, and `ConnectionStatus` (mounted in `App.tsx`) shows a
  persistent red banner with the exact error and a Retry button.

Demo data is never substituted for real data because of an error. The demo
collections *do* still exist in supabase mode — see next section — but that
is a documented scope decision, not error handling.

## Phase-1 scope: what is real, what stays demo

Phase 1 deliberately migrates only a thin vertical slice onto the real
database. In supabase mode the Dal is **the demo Dal used as the base**
(all 72 workspace tabs keep working against demo collections) **plus** a
`dal.phase1` field that talks to real tables:

**Real (Supabase) in Phase 1** — via `Phase1Repos`
(`app/src/dal/supabase/phase1-repos.ts`), eight approved methods:

1. `getProducts()` — active products, ordered category → sort_order
2. `getOrders(filter?)` — orders with `order_items` joined, newest first
3. `createOrder(input)` — customer find-or-create, DB-priced lines,
   integer-cent totals (7.5% tax + tip), DB-generated order number
4. `updateOrderStatus(id, status)` — sets `completed_at` on `picked_up`,
   writes an audit row
5. `getCustomers(search?)` — ilike on full_name/phone/email
6. `getCateringLeads(stage?)`
7. `createCateringLead(input)`
8. `updateCateringLeadStage(id, stage)` — with audit row

**Tables involved:** `profiles`, `customers`, `products`, `orders`,
`order_items`, `catering_leads`, `audit_log` (see
[database-schema.md](database-schema.md)).

**Stays demo in Phase 1:** everything else — prep engine, KDS, checklists,
pit workspace, retail fire sheet, packing, quotes/venues/portal, marketing,
admin, public checkout flows. These keep their demo repositories in both
modes until their phase lands.

## Money invariants

* All money is **integer cents** end to end (DB `CHECK (>= 0)` + app
  `src/lib/money.ts`).
* Sales tax fixed at **7.5%**, rounded **half-up** (owner directive; changing
  the constant requires explicit owner approval).
* `total_cents = subtotal_cents + tax_cents + tip_cents` is enforced by a DB
  CHECK constraint, and the same formula is computed by the shared
  `orderTotals()` function.
* Prices are always read from the `products` table server-side of the
  computation — client-supplied prices are never trusted.

## Known Phase-1 compromises (fixed in Phase 2)

* `createOrder` runs as multiple PostgREST calls (customer → order → items)
  with best-effort cleanup, **not** a transaction. Phase 2 moves it into a
  single transactional RPC (security-definer function).
* Kitchen role can still SELECT money columns on the base `orders` table
  (the sanctioned path is the `kitchen_orders_v` view, which has no money
  columns). Phase 2 adds column-level masking.
* Status-transition rules are enforced app-side; Phase 2 adds a DB
  transition-guard trigger.
* No auth UI yet — supabase-mode reads run as `anon` and are therefore
  blocked by deny-by-default RLS until a session exists. This is expected
  and visible (red banner), not a bug.

## Phase roadmap

| Phase | Contents |
|---|---|
| **1 (this)** | Foundation schema + RLS + seeds + pgTAP tests; `Phase1Repos` slice; connection status UI; docs |
| **2** | Auth (staff login mapped to `profiles`), transactional `create_order` RPC, DB status-transition guard, kitchen column masking, migrate orders/customers/catering tabs onto Supabase repos |
| **3** | Fire Drop / public checkout Edge Function, preorders, payments (Square) — sandbox until owner approves live charges |
| **4+** | Remaining domains per `supabase/future-phases/` (KDS, prep, pit, marketing, portal), realtime subscriptions |

## Related docs

* [database-schema.md](database-schema.md) — every table/enum/policy
* [roles-and-permissions.md](roles-and-permissions.md) — 6-role matrix
* [local-setup.md](local-setup.md) — provisioning + wiring the app
* [testing.md](testing.md) — JS + pgTAP suites
* [rollback.md](rollback.md) — how to back out safely
