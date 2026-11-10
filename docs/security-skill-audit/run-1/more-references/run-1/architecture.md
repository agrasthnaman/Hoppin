# Hoppin — architecture summary (run-1, deep)

## 1. Product, principals, protected resources
Hoppin is a group-trip planner PWA: itinerary items, bookings, documents, expenses/settlement, polls, notifications/email digests, maps, offline cache (`README.md:3`). Principals: **anon** (landing, auth, sign-up-queue RPCs, `GET /api/expand-map-link`); **authenticated non-member** (`create_trip`, `redeem_invite`, own profile/member row); **pending/removed member** (own `members` row only); **approved member** (trip data, own+shared items, shared docs, expenses, polls, RSVPs); **organizer** (`role='organizer'`: edit/delete trip, update `members`, invites, approve/remove, roles, read members' personal documents, delete any object in trip folder); **named guest** (no account, `trip_guests`); **service_role** (edge functions); **cron** (pg_cron+pg_net with Vault secrets); **project owner** (`postgres`, release script via Supabase Management API). Protected resources: per-trip data (tenant = trip), private items/personal documents (owner-scoped within trip), storage objects in private bucket `trip-documents`, member status/roles, email addresses/registration state, operator email spend (Resend, Supabase invite mail), release credentials.

## 2. Comparable baseline
Standard Supabase RLS + PostgREST + SECURITY DEFINER RPC app; expense model is Splitwise/Tricount-like ("Settle up / Fewest payments", `packages/core/src/settlement.ts`); design cites TripMojo (`docs/superpowers/specs/2026-11-03-tripapp-design.md:3`). In this pattern, PostgREST exposes every granted table/column/function directly to any JWT holder, so client-side checks are not controls.

## 3. Stack, deployment, offline limits
TypeScript/React 19/Vite 8/vite-plugin-pwa (Workbox), Dexie IndexedDB, maplibre, pdfjs, tesseract.js; Supabase Postgres 17 (migrations 001,005–015), Supabase Storage, Deno edge functions `send-digest`, `drain-signup-queue` (deployed `--no-verify-jwt`, shared-secret header); Cloudflare Pages static app + Pages Function `apps/web/functions/api/expand-map-link.ts`; no CSP/_headers. Release: `scripts/release.mjs` (Management API raw SQL, `wrangler pages deploy`). Local validation: Docker sandbox (`node:20-alpine`, no network, read-only target with `.env` files masked, 768 MiB, 1 CPU, 64 pids, 64 MiB scratch disk image, wall clock) running plain-JS harnesses against PGlite (`/target/node_modules/@electric-sql/pglite/dist/index.js`) loaded with `supabase/test/bootstrap.sql` + all migrations. Host vitest/rolldown binaries are darwin-only and cannot run in the sandbox. **Harness fidelity gaps:** bootstrap does not reproduce Supabase default privileges (hosted Supabase grants ALL on public tables and EXECUTE on functions to anon/authenticated by default); `storage.objects` stub lacks UPDATE grant and Storage API; no GoTrue/PostgREST/pg_cron/pg_net/Vault; PGlite runs as superuser.

## 4. Entry surfaces and key source-to-sink paths
- PostgREST direct table writes: `items`, `rsvps`, `documents` (free-text `storage_path`, `kind`), `trip_guests`, `polls` delete, `trips` update (all columns incl. `created_by`), `members` update (all columns), `profiles` update (`001_core.sql:189-258`, `005:310-324`, `007:45-70`, `012:46-71`).
- PostgREST RPC: `create_trip`, invites (`create/revoke/redeem_invite`, `approve/remove_member`), `set_member_role`, `leave_trip`, `delete_my_account`, `my_account_blockers`, `save_expense(jsonb)`, `delete_expense`, polls, notifications, `shares_trip_with`, anon `signup_queue_status`/`join_signup_queue` (`014:38-83,140`).
- Storage: insert path-scoped (`008:25-30`); **select trusts any visible `documents.storage_path = name`** (`008:33-40`); delete own folder or organizer of folder[1] (`010:147-155`); client `storage.remove` of `documents.storage_path` on leave/delete-trip/delete-account (`apps/web/src/app/services.tsx:114-226`).
- Derived copies: `items_log_change` → `change_log` (`009:4-22`) → notifications/`digest_queue` (`006`) → email HTML (`supabase/functions/send-digest/run.ts:55-104`).
- Edge functions: `send-digest` (`index.ts:19-59`), `drain-signup-queue` (`index.ts:13-44`, `inviteUserByEmail` with anon-supplied email/name).
- Pages Function: `/api/expand-map-link?url=` manual redirect follow with host allowlist (`apps/web/src/lib/expand-map-link.ts:2-37`), `cache-control: public, max-age=86400`.
- Browser sinks: `components/map/MapView.tsx:159-166` raw `link.href = location_url`; document blob reopen with stored contentType (`offline/sync.ts:91-96`, `lib/open-file.ts:13-28`); IndexedDB/localStorage lifecycle (`offline/db.ts`, `sync.ts:98-115`); auth `next`/`redirectTo` (`routes/SignIn.tsx:10-31`, `ConfirmEmail.tsx:12-46`, `JoinRoute.tsx:18`, email templates); ICS export (`packages/core/src/ics.ts:66-84`); PDF/OCR import (`lib/pdf-text.ts`, tesseract default CDN).

## 5. Trust boundaries and strongest controls
- Trip tenancy: RLS on every app table via SECURITY DEFINER helpers `is_approved_member`, `is_organizer`, `can_edit_item`, all `set search_path=public` (`001:88-116`).
- Organizer authority invariants: `set_member_role` last-organizer check (`010:27-48`), `remove_member` refuses organizers (`007:140-155`) — bypassable candidates via `members_update` all-column policy (`001:191,208-209`).
- Item ownership/trip immutability: `items_before_update` (`010:7-21`, `current_user='postgres'` hatch).
- Storage object scope: folder policies (`008`, `010:147-155`).
- Edge functions: constant-time shared-secret `authorized()` (`supabase/functions/drain-signup-queue/drain.ts:53-61`).
- Function EXECUTE: `revoke ... from public` only in 001/005/007/010/012/013; explicit anon/authenticated revokes in 006/014/015.
- Browser: React escaping; no CSP; same-origin blob URLs.

## 6. Starting paths
`supabase/migrations/*.sql`, `supabase/test/{bootstrap.sql,helpers.ts,pglite.ts}`, `supabase/functions/*`, `apps/web/src/{app,data,lib,offline,routes,components/map}`, `apps/web/functions/api`, `apps/web/vite.config.ts`, `packages/core/src`, `scripts/*.mjs`, `supabase/email-templates`.

## 7. Prior coverage
No prior run exists for this repository; no carried confirmations or exclusions.

## 8. Companion selection
Selected: `WEB-PROTOCOL-AND-AUTH.md` (Supabase auth email/redirect flows, edge-function shared-secret auth, public-cached Pages Function); `DATA-ISOLATION-AND-LIFECYCLE.md` (multi-tenant RLS, storage object references, change_log/digest derived copies, member removal and account deletion); `CLIENT-SIDE.md` (raw-DOM href sink, same-origin blob rendering, IndexedDB/service-worker lifecycle); `CLOUD-AND-DEPLOYMENT.md` (Supabase default-privilege drift, edge functions with verify_jwt off, bucket config); `RESOURCE-EXHAUSTION-AND-AVAILABILITY.md` (anon sign-up queue → operator email spend, unbounded text/jsonb fields rendered to other members); `SUPPLY-CHAIN-AND-RELEASE.md` (release script, build-context env baking, internal registry lockfile, runtime CDN code). Excluded: `AI-AND-LLM.md` (no model/agent code), `MEMORY-SAFETY-AND-BINARY.md` (no native/unsafe code in target; pdfjs/tesseract are third-party wasm/JS in-browser), `DESKTOP-MOBILE-AND-LOCAL-IPC.md` (web PWA only; mobile plan is a doc), `PROTOCOLS-RPC-AND-MESSAGING.md` (no broker/gRPC/GraphQL/custom protocol; cron→function calls are covered under cloud event-source identity).
