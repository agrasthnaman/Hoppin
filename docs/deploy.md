# Environments and deployment

No secrets belong in this file or in the repo. Keys live in `apps/web/.env.local` (git-ignored) and in each host's secret settings.

## Dev (set up 2026-11-04)
- **Supabase project:** `hoppin-dev`, region ap-southeast-1 (Singapore), Postgres 17. Project ref `xbcywfgodoweoqzqmufg`.
- **Applied migrations, in order:** `001_core.sql`, `007_invites_profiles.sql`, `008_storage.sql`, `009_trip_delete.sql` (fixes deleting a trip, found by the real-project test), `010_account.sql` (leave a trip, co-organizers, delete an account). Verified on the real project with a rolled-back privacy check: sign-up creates profiles, a pending member sees nothing, an approved member sees shared items but not private ones, outsiders see nothing, and uploads are limited to your own folder. All 8 tables have row-level security.
- **Auth settings:** site URL `http://localhost:5173`; allowed redirects `http://localhost:5173/**` and `http://localhost:4173/**`.
- **Web app config:** `apps/web/.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the anon key is public by design; never put the `service_role` key in the app).

## Testing against the real dev project
`npm run test:dev -w apps/web` runs the app's real data code (sign in, trips, invites, privacy, RSVPs, version conflicts, documents, offline sync, removal) against `hoppin-dev` with two throwaway users. Last run: 16 of 16 passed (2026-11-04), including the offline-change scenarios, the organizer tools (create a trip, invite links, approval, edit rights) and account basics (name, co-organizer, leaving, deleting a trip and an account).

It needs two confirmed test users. Either:
- create them directly in the dev database (confirmed email, a password, an `auth.identities` row) and pass `SMOKE_EMAIL_ALICE`, `SMOKE_EMAIL_BOB` and `SMOKE_PASSWORD` in the environment, or
- turn off "Confirm email" in the dev project (Authentication > Providers > Email) so the test can sign users up, and turn it back on afterwards.

It runs in plain Node, not the simulated browser (jsdom corrupts file uploads). **Clean up afterwards:** remove the uploaded files through the Storage API (direct deletes from `storage.objects` are blocked on purpose), then `delete from public.trips where created_by in (select id from auth.users where email like 'smoke-%@example.invalid'); delete from auth.users where email like 'smoke-%@example.invalid';`

## Hosting (Cloudflare Pages), set up 2026-11-04
- **Live address:** https://app.hoppinclub.com (also https://hoppinclub.pages.dev). Domain `hoppinclub.com` is registered and managed in Cloudflare; the app is the `app` CNAME to `hoppinclub.pages.dev` (proxied). The root domain is free for a landing page later.
- **Project:** Cloudflare Pages project `hoppinclub`, "direct upload" (the site is built on a developer machine and uploaded, not built by Cloudflare). This avoids Cloudflare's build reading `package-lock.json`, which points at an internal package registry.
- **Publishing a new version** (needs a Cloudflare API token with Pages edit, and the account id):
  ```
  cd apps/web && npx vite build                      # uses apps/web/.env.local for the Supabase address and key
  CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
    npx wrangler pages deploy dist --project-name hoppinclub --branch main
  ```
  (`wrangler` is installed in a scratch folder, not in the repo: `npm install wrangler`.) Demo mode is not included in production builds.
- **Supabase sign-in addresses:** site URL `https://app.hoppinclub.com`; allowed redirects also include `https://hoppinclub.pages.dev/**` and the `localhost` addresses.
- Deep links (`/trips/...`, `/join/...`) work because Pages serves the app for unknown paths; the service worker and manifest are served correctly.

## Applying a new migration to a Supabase project
Paste the file into the project's SQL editor, or send it through the Management API `database/query` endpoint with an access token. Run migrations in filename order. Test them first against the in-memory database (`npm test -w supabase`).

## Known limits and to do
- **Email:** Supabase's built-in email is limited to **2 messages per hour** (and the free plan cannot change the email design), so a group cannot sign in with it. Before real use, follow [email-setup.md](email-setup.md).
- **Prod project, hosting (Cloudflare Pages), domain, Unsplash/Pexels keys, map-tile key, web push keys:** not set up yet (issues #1 and #2).
- **Hosted builds** read `package-lock.json`, which currently points at an internal Artifactory registry, so a hosted build cannot install from it yet. Decide how to handle the lockfile before setting up hosting.
- Backups: check what the Supabase plan includes before the first real trip; free projects may pause when unused.
