# Fire Sheet V2 — development & preview

## Run the V2 app (demo mode, no credentials needed)

```bash
cd app
npm install
npm run dev        # http://localhost:5173
npm test           # vitest — 30 tests
npm run build      # type-check + production build (output in app/dist)
```

Demo mode is the default (`VITE_DATA_MODE=demo`): seeded data, persisted in
the browser via IndexedDB, no backend or secrets required. See `.env.example`.

## Preview a branch build without touching the live site

The root of this repository (the static prototype) is what GitHub Pages
serves from `main`. The V2 app lives in `app/` and does not interfere.
To preview a branch build: `npm run build` and serve `app/dist`, or download
the branch and open it locally. A CI preview workflow is proposed for a
follow-up commit (needs owner approval to add Actions workflows).

## Supabase

Migrations live in `supabase/migrations/`. They are not applied anywhere yet —
provisioning a Supabase project is gated on owner approval. Demo mode keeps
every workflow exercisable meanwhile.
