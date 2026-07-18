# Rollback — Supabase Phase 1

Key fact first: **frontend rollback never drops the database.** The Supabase
project, its schema, and all its data remain intact no matter which option
below you take. Rolling back only changes what the app talks to.

## Option 1 — flip the mode switch (fastest, zero risk)

1. Edit `app/.env.local` (or the deploy environment):

   ```ini
   VITE_DATA_MODE=demo
   ```

2. Rebuild / restart:

   ```bash
   cd app && npm run build     # or just restart `npm run dev`
   ```

The app is back on the fully seeded demo DAL — all 72 tabs work with no
backend at all. `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` can stay set;
they are ignored in demo mode. The Supabase project keeps running untouched
and can be re-enabled by flipping the variable back.

## Option 2 — revert the code

If the Phase 1 code itself must come out of the branch:

```bash
# see what landed
git log --oneline -- app/src/dal/supabase app/src/app/ConnectionStatus.tsx docs supabase

# revert a specific commit (creates a new commit, history preserved — preferred)
git revert <commit-sha>

# or, since the work lives on its own branch and the PR is still open,
# simply close the PR and delete the branch:
git push origin --delete claude/supabase-foundation
git branch -D claude/supabase-foundation
```

`main` never carried the Supabase wiring, so deleting the branch fully
restores the previous state. Note `git revert` on the migration file only
removes the **file from the repo** — it does not run anything against the
database (see below).

## What rollback does NOT do

* It does **not** drop tables, delete rows, or touch RLS. Undoing the
  *database* would be a separate, deliberate act (running `drop table` /
  `drop type` statements by hand or `supabase db reset` on a local stack)
  and should basically never be needed: the schema is additive and inert
  when unused.
* It does not rotate keys. If a key was ever exposed, rotate the anon key in
  the Supabase dashboard (Settings → API) regardless of any code rollback.

## Order of operations in an incident

1. Flip `VITE_DATA_MODE=demo` + rebuild (Option 1) — users are unblocked
   immediately, red banner disappears, demo data serves every tab.
2. Investigate with the app safely in demo mode; the staging DB and its
   `audit_log` remain available for forensics.
3. Only then decide whether code revert (Option 2) or a schema fix-forward
   migration is warranted.
