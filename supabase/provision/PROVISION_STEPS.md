# Supabase provisioning — 10-minute click-path

No command line required. You do steps 1–4; hand me the two values from step 3
and I do the rest (wire the app, run the database tests, flip supabase mode).

## 1. Create the project (only you can do this)
- Go to supabase.com → sign in / sign up (free tier is fine for staging).
- New project → name it e.g. `station-house-staging` → pick a region near Tampa
  (us-east-1) → set a database password (save it in your password manager).
- Wait ~2 min for it to finish provisioning.

## 2. Run the schema + seed
- Left sidebar → **SQL Editor** → **New query**.
- Open `supabase/provision/provision.sql`, copy the whole file, paste it in, **Run**.
- You should see "Success. No rows returned." That created 8+ tables, all the
  security policies, the order-number generator, the checkout function, and
  loaded demo products/customers/orders/leads.

## 3. Grab the two PUBLIC keys (safe to share with me)
- Left sidebar → **Project Settings** → **API**.
- Copy **Project URL** (looks like `https://abc’d.supabase.co`).
- Copy the **anon / public** key (a long token labeled "anon" "public").
- Paste both to me in chat. These are safe — they're meant for browser use.
  ⚠️ Do NOT send the `service_role` key or your database password — I never
  need those and they must never touch the frontend.

## 4. (Optional now) create your first staff login
- Left sidebar → **Authentication** → **Users** → **Add user** → your email +
  a password. After the app is wired I'll show you how to attach the owner role.

## What I do once you send the URL + anon key
1. Put them in the app's environment (public values only — nothing secret in git).
2. Flip `VITE_DATA_MODE=supabase` on a preview build.
3. Run the pgTAP database tests against the new project (the 41 + 12 checks that
   were written but couldn't run without a live DB) and report results.
4. Verify RLS is active (anon is blocked from the tables) and sign-in works.
5. Report back before anything replaces the demo — nothing goes live without
   your say-so.

## Rollback (always available)
Set `VITE_DATA_MODE=demo` and rebuild — the app returns to the per-device demo
instantly, and your Supabase project + data are untouched. See docs/rollback.md.
