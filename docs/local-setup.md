# Local Setup — Supabase Staging for Fire Sheet V2

Goal: a Supabase project running the Phase 1 schema, with the app (`app/`)
pointed at it in `supabase` mode. Demo mode needs none of this
(`VITE_DATA_MODE=demo` and `npm run dev` just work).

## 1. Create a Supabase project

1. [supabase.com](https://supabase.com) → **New project** (org: Station House
   BBQ). Region `us-east-1` (closest to Tampa).
2. Save the **database password**, **project ref**, and **anon key** in the
   owner's password manager. The **service_role key stays in Supabase** —
   it must never appear in the repo, the app, or `.env` files.

## 2. Run the migrations (in order)

**Option A — Supabase CLI (preferred):**

```bash
supabase login
supabase link --project-ref <PROJECT_REF>
supabase db push        # applies supabase/migrations/ in filename order
```

**Option B — SQL editor:** Dashboard → SQL Editor → paste and run each file
from `supabase/migrations/` in filename order (Phase 1 is just
`0001_phase1_foundation.sql`).

> `gen_random_uuid()` is built in on PG 13+; no extension step is needed for
> Phase 1.

## 3. Seed demo data

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed/seed.sql
```

(or paste `supabase/seed/seed.sql` into the SQL editor). The seed is
idempotent — fixed UUIDs / stable SKUs with `ON CONFLICT DO NOTHING` — and
contains only obviously fake customers (555-01xx phones, @example.com).

For a fully local stack instead: `supabase start && supabase db reset`
(add the seed path to `[db.seed] sql_paths` in `supabase/config.toml`, or
load it manually against `postgresql://postgres:postgres@127.0.0.1:54322/postgres`).

## 4. Get the URL and anon key

Dashboard → Project Settings → API:

* **Project URL** → `VITE_SUPABASE_URL`
* **anon / public key** → `VITE_SUPABASE_ANON_KEY`

The anon key is publishable — every row it can reach is gated by
deny-by-default RLS. Do **not** copy the service_role key.

## 5. Point the app at it

```bash
cd app
cp .env.example .env.local     # .env.local is gitignored — real values live here only
```

Edit `app/.env.local`:

```ini
VITE_DATA_MODE=supabase
VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

Then `npm install && npm run dev`. Vite only exposes `VITE_`-prefixed
variables — unprefixed `SUPABASE_URL`/`SUPABASE_ANON_KEY` will silently not
work in the browser build.

## 6. Verify

**RLS is active on every table:**

```sql
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relkind = 'r'
order by relname;
```

Every Phase 1 table (`audit_log`, `catering_leads`, `customers`,
`order_items`, `order_number_counters`, `orders`, `products`, `profiles`)
must show `relrowsecurity = t`.

**Anon is blocked** (the deny-by-default check):

```sql
set local role anon;
select count(*) from public.products;  -- must ERROR: permission denied
reset role;
```

**In the app:** with `VITE_DATA_MODE=supabase`, a top banner appears on
load. Green "Supabase connected (staging)" (auto-hides after 5s) means the
ping query succeeded. A red persistent banner shows the exact error —
including "permission denied" while no staff session exists, which is the
RLS deny-by-default doing its job (Phase 1 ships no login UI yet; Phase 2
adds staff auth). The app **never** falls back to demo data in supabase
mode.

**Run the pgTAP suites** — see [testing.md](testing.md).
