# Supabase provisioning runbook — Station House Fire Sheet V2

Backend for the V2 app (`app/`). Everything below is **sandbox-only** until the
owner approves production Square credentials and a live-charge test plan
(docs/ARCHITECTURE.md §6.8).

## 1. Create the project

1. [supabase.com](https://supabase.com) → New project (org: Station House BBQ).
   Region: `us-east-1` (closest to Tampa; keeps ET timestamp math cheap).
2. Save the **database password**, **project ref**, **anon key**, and
   **service_role key** in the owner's password manager. The service_role key
   never leaves Supabase function secrets / CI secrets (§10 — no secrets in
   the repo, ever).

## 2. Enable extensions

Dashboard → Database → Extensions:

- **pg_cron** — required by the Monday Fire Drop advance (migration 0002
  schedules `advance_fire_drop()` only if the extension exists — enable it
  **before** running migrations, or re-run the `cron.schedule` block after).
- `pgcrypto` (usually on by default; `gen_random_uuid()` / `gen_random_bytes`).

Set the cron timezone so `5 0 * * 1` means Monday 00:05 **ET**:

```sql
alter system set cron.timezone = 'America/New_York';
select pg_reload_conf();
```

## 3. Run migrations (in order)

```bash
supabase link --project-ref <PROJECT_REF>
supabase db push          # applies supabase/migrations/ in filename order
```

| Migration | Contents |
|---|---|
| `0001_core.sql` | roles, identity, CRM, catalog, orders, prep, fire drops, infra (audit/webhooks/outbox), core RLS |
| `0002_operations.sql` | KDS, checklists, prep recipes, pit, retail fire sheet, temp log, fire drop slots, preorders, packing, quotes/venues/portal/equipment, marketing, admin (discounts/samplers/settings/imports), RLS for all of it, `advance_fire_drop()` + pg_cron schedule |
| `0003_checkout_fn.sql` | `checkout_fire_drop()` transactional checkout + recovery, `track_preorder()` public lookup |

Then regenerate app DB types:

```bash
supabase gen types typescript --linked > app/src/dal/supabase/db-types.ts
```

## 4. Deploy Edge Functions

```bash
supabase functions deploy create-checkout
supabase functions deploy square-webhook --no-verify-jwt   # Square can't send a JWT
supabase functions deploy notifications-drain
```

Required secrets (`supabase secrets set KEY=value`):

| Secret | Used by | Notes |
|---|---|---|
| `SQUARE_ACCESS_TOKEN` | create-checkout | **Sandbox** token from developer.squareup.com. Functions return `503 payments not configured` when unset — safe default. |
| `SQUARE_LOCATION_ID` | create-checkout | Sandbox location id; verified against every payment. |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | square-webhook | From the Square webhook subscription page. |
| `SQUARE_NOTIFICATION_URL` | square-webhook | Exact URL configured in Square, e.g. `https://<PROJECT_REF>.functions.supabase.co/square-webhook`. HMAC is computed over `url + raw_body` — a mismatch rejects every event. |
| `RESEND_API_KEY` | notifications-drain | Leave **unset** until owner approves live email — the drain then logs and leaves rows unsent. |
| `NOTIFY_RECIPIENTS` | notifications-drain | Defaults to `catering@stationhousebbq.com,info@stationhousebbq.com`. |
| `NOTIFY_FROM` | notifications-drain | Optional; verified Resend sender. |

(`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.)

Square dashboard → Webhooks (sandbox): subscribe `payment.created`,
`payment.updated` to the `square-webhook` URL.

Schedule the drain (after pg_cron + pg_net are enabled), every minute:

```sql
select cron.schedule('notifications-drain', '* * * * *', $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.functions.supabase.co/notifications-drain',
    headers := '{"Authorization": "Bearer <ANON_KEY>", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb)
$$);
```

## 5. Point the app at Supabase

In the app host's env (GitHub Actions encrypted secrets → build env):

```
VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_DATA_MODE=supabase
```

`VITE_DATA_MODE=demo` remains the default until cutover is approved; the demo
adapter stays shipped either way (§3).

## 6. Go-live test checklist (sandbox)

Run all of these against the sandbox project **before** the owner sees it:

1. **Sandbox charge** — from the public Fire Drop page, order 1 item with
   Square sandbox test card `cc:ok` (Web Payments SDK sandbox nonce). Expect:
   `checkout_attempts` row (status `completed`), `preorders` row (status
   `paid`, correct 7.5% round-half-up tax), `preorder_items` priced from
   `fire_drop_products` (not the client), slot `booked` +1, product
   `sold_qty` +qty, `notifications_outbox` `order.created` row.
2. **Window enforcement** — attempt a Friday order after Thu 17:00 ET (or
   temporarily shift the clock assertion in a staging copy): expect 409 from
   the Edge Function AND an exception from `checkout_fire_drop` if called
   directly.
3. **Webhook signature** — valid + invalid cases:

   ```bash
   BODY='{"event_id":"test-evt-1","type":"payment.updated","data":{"object":{"payment":{"id":"TEST","status":"COMPLETED"}}}}'
   URL='https://<PROJECT_REF>.functions.supabase.co/square-webhook'
   SIG=$(printf '%s%s' "$URL" "$BODY" | openssl dgst -sha256 -hmac "$SQUARE_WEBHOOK_SIGNATURE_KEY" -binary | base64)
   # valid → 200
   curl -s -o /dev/null -w '%{http_code}\n' -X POST "$URL" \
     -H "x-square-hmacsha256-signature: $SIG" -H 'Content-Type: application/json' -d "$BODY"
   # tampered → 401
   curl -s -o /dev/null -w '%{http_code}\n' -X POST "$URL" \
     -H "x-square-hmacsha256-signature: $SIG" -H 'Content-Type: application/json' -d "${BODY}x"
   # replay of test-evt-1 → 200 "already processed", no duplicate work
   ```

4. **Recovery path** — create a checkout attempt + sandbox payment, then kill
   the client before finalize (comment out the rpc call in a staging deploy).
   Fire the webhook for that payment id: expect exactly one `preorders` row
   (status history actor `square-webhook`), attempt status `recovered`;
   replaying the webhook creates nothing new.
5. **RLS smoke** — create one test auth user per role (`owner_admin`,
   `catering_director`, `kitchen`, `counter_foh`, `packing`) and one row in
   `user_roles` each. With each user's JWT: kitchen can read/write
   `kds_tickets` + `prep_entries` but gets zero rows from `meat_costs`,
   `payments`, `quotes`; counter_foh can update `preorders` but not `leads`;
   packing can write `pack_jobs` but not `retail_fire_items`; anon gets zero
   rows from every table and can only call `track_preorder()` /
   `create-checkout`. Automate as pgTAP under `supabase test` in CI (§5).
6. **Cap-concurrency test** — set a product `cap_qty` to 1 and fire two
   simultaneous checkouts (e.g. `xargs -P2` with two curl bodies). Exactly one
   succeeds; the loser gets 409 with an automatic sandbox refund. The
   `select … for update` locks in `checkout_fire_drop` are what make this
   pass — do not "optimize" them away. Repeat for slot capacity.
7. **Monday advance** — `select advance_fire_drop();` manually: new
   `fire_drops` row next Fri/Sat, products cloned with `sold_qty=0`, slots
   cloned with `booked=0`, `audit_log` `drop.advanced` row, outbox row.
   Running it twice in one week is a no-op.
8. **Drain** — invoke `notifications-drain` with no `RESEND_API_KEY`: rows
   logged, left unsent. Set a test key: rows send once, `sent_at` set,
   replays send nothing.

## 7. Not yet / never

- No production Square credentials, live email, or data migration without
  owner sign-off (§1 non-goals).
- The service_role key and webhook signature key never appear in the client
  bundle, repo, or logs.
