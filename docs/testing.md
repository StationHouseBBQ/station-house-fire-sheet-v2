# Testing — Fire Sheet V2

Two independent suites: the JS suite (always runnable, no backend) and the
pgTAP SQL suites (need a Postgres with the migrations applied).

## 1. JS suite (vitest) — no backend needed

```bash
cd app && npm test        # = vitest run
```

Covers, among 140+ tests:

* `src/lib/money.test.ts` — integer-cent math, the fixed 7.5% half-up tax,
  tip handling (`orderTotals(lines, tipCents)`), spec examples
  ($23.00 → 2300, $45.99 → 4599), rounding boundaries.
* `src/lib/secrets.test.ts` — walks the app tree and **fails the build** on
  JWT-looking strings (`eyJ…`), `service_role` references in `src/`, or
  Square/Stripe live-credential prefixes; asserts `.env` is absent and
  `.env.example` holds only empty placeholders.
* `src/app/routes.smoke.test.tsx` — renders all 72 workspace tabs + public
  routes against the demo DAL.

Type-check and production build:

```bash
cd app && npx tsc --noEmit && npm run build
```

## 2. pgTAP suites — needs a provisioned database

Both files self-install pgTAP (`create extension if not exists pgtap with
schema extensions;`), run inside one transaction, and **roll back** — no
state is left behind. Run them against a local stack
(`supabase start && supabase db reset`, then seed) or a staging project:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/phase1_tests.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_role_tests.sql
```

For the local stack, `DATABASE_URL` is
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

* `phase1_tests.sql` — plan of **41**: tables/enums exist, money CHECK
  constraints, order-number trigger format + uniqueness, updated_at touch
  triggers, anon denial. Requires the seed to be loaded (row-count tests).
* `rls_role_tests.sql` — plan of **12**: simulates JWTs per role via
  `set local role authenticated` + `request.jwt.claims` and asserts the
  role matrix (counter can insert orders, marketing cannot see customers,
  kitchen can read `kitchen_orders_v` and bump status, owner sees all
  profiles, …). Creates its own fixture users inside the transaction.

### Which tests are provisioning-gated

| Suite | Gate |
|---|---|
| `cd app && npm test` | none — always runs (demo DAL, node fs) |
| `npx tsc --noEmit`, `npm run build` | none |
| `supabase/tests/phase1_tests.sql` | needs Postgres with migration **and seed** applied (local `supabase start` is enough) |
| `supabase/tests/rls_role_tests.sql` | needs Postgres with migration applied and an `auth.users` table (Supabase local stack or hosted project) |
| Live app smoke in supabase mode (green banner, `phase1` repos) | needs a **hosted/staging project + anon key in `app/.env.local`** — gated on owner provisioning approval |

There is no CI hookup for the SQL suites yet; run them manually after any
migration change.
