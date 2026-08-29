# Duo 💛

A cozy little world for two — Next.js 15 + Supabase (Postgres, Auth, Storage, Realtime), PWA.

## Run it locally (one command)
Prereqs: Docker Desktop running, Node 20+.

```bash
docker compose up --build     # run from this duo/ directory
```
That's it. Compose starts a `supabase` supervisor container (the Supabase CLI, talking to your Docker daemon) which brings up Postgres, Auth, REST, Realtime, Storage, Studio and Mailpit, applies `supabase/migrations` + `supabase/seed.sql` + buckets + the email template — then builds and starts the `web` container once Supabase is healthy. `docker compose down` stops everything and keeps the data.

- App: http://localhost:3000
- Emails (magic link + 6-digit code): http://127.0.0.1:54324 (Mailpit)
- Supabase Studio: http://127.0.0.1:54323
- Stop everything: `docker compose down` (data kept) · wipe + re-migrate: `npm run db:reset`

The `web` container runs `next dev` with your source bind-mounted, so every save hot-reloads at http://localhost:3000 — no rebuild. Only `package.json` changes need `docker compose up --build web` (then `docker compose run --rm web npm ci` refreshes the `node_modules` volume). Production build in Docker (what Vercel ships): `npm run up:prod`. Host-side dev without the web container: `docker compose up supabase` then `npm run dev` (uses `.env.local`).

> ⚠️ The `supabase` service mounts your Docker socket — it controls your Docker daemon. That's how the CLI manages its stack. **Local dev only; never deploy this compose file.** The npm scripts (`npm run db:reset`, `npm test`, …) additionally need `npm install` once.

## How the compose file is wired
`docker/supabase.Dockerfile` builds a tiny supervisor (Supabase CLI + docker-cli + socat). It mounts your Docker socket and the project at the same absolute path, runs `supabase start`, forwards ports 54321–54324 to the host so the CLI can reach its own stack, and on `docker compose down` runs `supabase stop` (data kept). The `web` service waits for its healthcheck.

## Tests
- `npm test` — pure functions in `lib/` (`cycle.js`, `pace.js`, `recap.js`).
- `node scripts/negative-test.mjs` — the RLS gate: a third account sees zero rows/objects, can't join, can't redeem; partner blur/own-only rules.
- `node scripts/seed-demo.mjs` — a linked demo couple (`a@duo.test` Zain · `b@duo.test` Hamna) with a month of data.
- Headless UI (Playwright, installed separately): `scripts/ui-check.mjs` (every page, both viewports, add-sheet), `scripts/ui-responsive.mjs` (every public + private page at 16 viewports 320px→4K; fails on horizontal overflow, screenshots to `shots/responsive/`; `ONLY=phone-320,4k` to narrow), `scripts/ui-flows.mjs` (two live browsers: blur/reveal, QOTD, hearts, ping, jars, notes, cycle, marks), `scripts/ui-onboarding.mjs` (real email → code → onboarding → invite → join).

## Two-phone test
Sign in as A → onboarding → **Start a Duo** → copy the invite link. In a second browser/profile sign in as B → open the link → sign in → linked. A third account sees nothing (see `supabase/schema.md` and `scripts/negative-test.mjs`).

## Production
Supabase project + Vercel; env vars from `.env.local.example`. `vercel.json` schedules the keep-alive and cleanup crons (`CRON_SECRET` header).
