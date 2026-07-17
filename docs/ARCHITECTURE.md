# Station House Fire Sheet V2 — Architecture

Status: draft for owner review · Branch: `claude/full-parity-foundation`

## 1. Goals and non-goals

**Goals:** functional parity with the Manus build (313 parity rows, see `PARITY_MATRIX.md`), on an owned stack: React + TypeScript frontend in this GitHub repository, Supabase (Postgres, Auth, RLS, Realtime, Storage, Edge Functions) backend, with the payment/webhook security fixes that the Manus implementation lacks.

**Non-goals (until owner approval):** production Square credentials, live customer email/SMS, production data migration, replacing the live GitHub Pages deployment, any change to the Manus reference app.

## 2. Frontend

- **Stack:** Vite + React 18 + TypeScript (strict), wouter for routing (matches source, ~2 KB), TanStack Query for server state, Tailwind for styling. Dark near-black theme, fire-orange `#ff5a1f → #ff8a3d` accents, tablet-first layouts, large tap targets.
- **Structure:**
  - `src/app/` — shell, router, providers, role guard.
  - `src/config/nav.ts` — single generated source of truth for all workspaces/tabs (72 tabs across Kitchen, Seminole, Pit, Packing, Catering/Sales, Marketing, Admin) plus standalone/public routes. Navigation is config-driven so the parity matrix, router, and sidebar can never drift apart.
  - `src/modules/<domain>/` — one folder per domain (kitchen, retail, pit, packing, catering, marketing, admin, portal, public). Views import from the DAL only.
  - `src/dal/` — typed data-access layer (below).
  - `src/lib/` — time (America/New_York helpers, Fire Drop cutoffs), money (integer cents), attribution capture, autosave.
- **Offline resilience:** operational inputs (prep counts, checklists, temp logs, fire-sheet quantities) write through a persistent outbox (IndexedDB via `idb-keyval`). UI shows explicit `saved locally / syncing / synced / error` states. Tab switches and refreshes never lose input.
- **Unimplemented parity rows** render a structured "parity-pending" panel showing the source component, expected behaviors, and matrix row number — never a dead button pretending to work, and removed as each row is implemented.

## 3. Data-access layer (DAL)

UI components never issue database queries. Each domain exposes a typed repository interface, e.g. `PrepRepository`, `OrdersRepository`, `FireDropRepository`:

```
UI → hooks (TanStack Query) → repository interface → adapter
                                          ├── DemoAdapter (seeded data, deterministic, in-browser)
                                          └── SupabaseAdapter (supabase-js, generated DB types)
```

- **Demo mode** is a first-class adapter, selected by `VITE_DATA_MODE=demo` or a runtime toggle; it ships seeded demonstration data mirroring the Manus seed shapes and persists to IndexedDB, so every workflow is exercisable without credentials. Demo stays until production migration is approved.
- **SupabaseAdapter** uses generated types (`supabase gen types`) and returns the same domain types, so switching adapters is invisible to the UI.
- Mutations return typed results and are audited (below).

## 4. Supabase schema

The Manus source is MySQL/Drizzle with 292 tables. We translate incrementally, starting with the core domains (initial migrations in `supabase/migrations/`):

- **identity:** `profiles` (extends `auth.users`), `teams`, `team_members`, `locations`, `roles` (enum: `owner_admin`, `catering_director`, `kitchen`, `counter_foh`, `packing`), `user_roles`.
- **crm:** `contacts` (with consent flags), `companies`, `leads` (native attribution columns: `utm_source/medium/campaign/term/content`, `gclid`, `fbclid`, `referrer`, `landing_page`), `lead_stage_history`, `activities`, `tasks`.
- **catalog:** `menu_categories`, `menu_items`, `menu_variants`, price history, activation flags, sort order.
- **orders:** `orders` (immutable `order_ref`, integer-cents totals, status enum), `order_items`, `order_amendments`, `order_versions`, `payments`, `refunds`, `order_status_history`, `checkout_attempts` (UUID PK, created *before* payment initiation), `pickup_slots` + capacity.
- **prep/kitchen:** `prep_templates`, `prep_recipes`, `prep_sessions`, `prep_entries`, `raw_inventory`, `order_guides`, `protein_conversions`.
- **fire drop:** `fire_drops` (auto-advancing week window), `fire_drop_products`, `fire_drop_slots`, `sold_out_flags`.
- **infra:** `audit_log` (actor, action, entity, before/after, timestamp), `webhook_events` (idempotency: unique event id, `processed_at` set only after work commits), `notifications_outbox` (durable `lead.created` / `order.created` events, retry-safe), `imports`.

Conventions: `bigint` identity PKs, `uuid` public tokens, money as integer cents, all timestamps `timestamptz`, all business times computed in `America/New_York`. Every business table carries `created_at`, `updated_at`, `created_by`, `updated_by`.

## 5. Row-Level Security

RLS is the authorization boundary; UI hiding is cosmetic. Policy pattern per table group:

| Role | Access summary |
|---|---|
| `owner_admin` | full read/write |
| `catering_director` | catering, leads, quotes, events, portal admin, related operational reads |
| `kitchen` | prep/kitchen/pit/expo/packing operational reads+writes; **no pricing/cost columns** (enforced via column-restricted views), no admin |
| `counter_foh` | Seminole orders, KDS, pickup completion, checklist, temp log |
| `packing` | packing tables + read-only order details needed to pack |
| anonymous | public catalog reads via security-definer RPCs only; no direct table reads that expose PII |

Public order confirmation lookups go through Edge Functions keyed by unguessable `uuid` tokens and return minimal fields (no PII beyond what the customer entered). RLS tests run in CI against a shadow database using `supabase test` (pgTAP) with one test user per role.

## 6. Payments and webhooks (mandatory deltas from Manus)

1. Client never supplies prices, tax, tips, discounts, totals, or inventory effects. `create-checkout` Edge Function recalculates everything from the catalog; 7.5% tax fixed server-side.
2. `checkout_attempts` row (UUID) persisted before creating the Square payment; the UUID rides in Square metadata.
3. `verify-payment` checks status, amount, currency, location, and attempt linkage against Square's API server-side. A caller-provided payment id is never proof of payment.
4. Square webhook Edge Function reads the **raw body** first, verifies the HMAC signature, and rejects missing/invalid signatures.
5. Processing is idempotent: `webhook_events.event_id` unique; work executes in a transaction; `processed_at` set only on success so retries are safe.
6. On `payment.completed` with no completed order (browser died mid-checkout), the order is recovered exactly once from the checkout attempt snapshot.
7. No hardcoded discount codes; discounts are DB rows validated server-side. Free/$1 client-side production orders are impossible because the server prices everything.
8. Square sandbox only until the owner approves production credentials and a live-charge test plan.

## 7. Fire Drop scheduling

- Cutoffs (authoritative): Friday pickup ordering closes Thu 17:00 ET; Saturday ordering opens Thu 17:00 ET, closes Fri 15:00 ET. Enforced in SQL (slot `open_at`/`close_at` computed in ET) and re-checked in `create-checkout` — not just hidden in the UI.
- Weekly advance: `pg_cron` job every Monday advances the drop window to next Fri/Sat, resets slot bookings, writes an audit row, and enqueues an owner notification in `notifications_outbox`.
- Sold-out: per-product flag + slot capacity checked inside the checkout transaction (`select … for update`), so concurrent checkouts cannot oversell.
- Public Fire Drop and catering landing pages require no employee login, and capture attribution (§4 crm) on every lead/order.

## 8. Notifications and events

`lead.created` and `order.created` are durable rows in `notifications_outbox`, drained by an Edge Function with exponential backoff; a failed send retries without duplicating the lead/order (send is keyed by outbox row id). Recipients `catering@stationhousebbq.com` / `info@stationhousebbq.com` activate only after owner-approved production testing.

## 9. Auditability

All business-critical mutations write `audit_log` rows (actor from `auth.uid()`, entity, action, JSON before/after diff) via DAL wrappers and DB triggers on status/payment columns. Order references are immutable; amendments create versioned rows rather than rewriting history.

## 10. Secrets

No secrets in the repository, ever. Square/webhook/email/service-role keys live in Supabase function secrets and GitHub Actions encrypted secrets. The client bundle contains only the publishable Supabase URL/anon key. `.env.example` documents required variables.

## 11. Testing & preview

- Vitest + Testing Library unit/component tests; money/tax/cutoff logic table-driven (7.5% totals, ET boundaries incl. DST).
- pgTAP RLS/role-matrix tests; webhook signature/idempotency/recovery tests against a local Supabase stack in CI.
- Preview: Vite build deploys to GitHub Pages under `/preview/<branch>/` (or Actions artifact) without touching the `main` demo until approved cutover.

## 12. Delivery

Work lands in small module-scoped commits on `claude/full-parity-foundation` → draft PR into `main`, following the build order in the handoff (shell/DAL/schema → Kitchen+MPE+Pit → Seminole/Fire Drop/KDS → Catering CRM/Portal → Packing → Marketing → Admin → hardening/QA). Every progress report includes branch, SHA, files, tests, preview URL, matrix deltas, and blockers.
