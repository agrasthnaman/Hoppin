# Environments and deployment

No secrets belong in this file or in the repo. Keys live in `apps/web/.env.local` (git-ignored) and in each host's secret settings.

## Dev (set up 2026-11-04)
- **Supabase project:** `hoppin-dev`, region ap-southeast-1 (Singapore), Postgres 17. Project ref `xbcywfgodoweoqzqmufg`.
- **Applied migrations, in order:** `001_core.sql`, `007_invites_profiles.sql`, `008_storage.sql`. Verified on the real project with a rolled-back privacy check: sign-up creates profiles, a pending member sees nothing, an approved member sees shared items but not private ones, outsiders see nothing, and uploads are limited to your own folder. All 8 tables have row-level security.
- **Auth settings:** site URL `http://localhost:5173`; allowed redirects `http://localhost:5173/**` and `http://localhost:4173/**`.
- **Web app config:** `apps/web/.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the anon key is public by design; never put the `service_role` key in the app).

## Applying a new migration to a Supabase project
Paste the file into the project's SQL editor, or send it through the Management API `database/query` endpoint with an access token. Run migrations in filename order. Test them first against the in-memory database (`npm test -w supabase`).

## Known limits and to do
- **Email:** Supabase's built-in email is limited to **2 messages per hour**, so a group cannot sign in with it. Before real use, set up custom SMTP (Resend) with a domain you own.
- **Prod project, hosting (Cloudflare Pages), domain, Unsplash/Pexels keys, map-tile key, web push keys:** not set up yet (issues #1 and #2).
- **Hosted builds** read `package-lock.json`, which currently points at an internal Artifactory registry, so a hosted build cannot install from it yet. Decide how to handle the lockfile before setting up hosting.
- Backups: check what the Supabase plan includes before the first real trip; free projects may pause when unused.
