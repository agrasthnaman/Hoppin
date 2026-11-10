# Findings detail — confirmed medium and higher

## A crafted link with tokens in the URL silently replaces a signed-in user's session on any route (session fixation / login CSRF)

**Fingerprint:** `apps/web/src/lib/supabase.ts:createSupabaseClient:implicit-detectSessionInUrl-replaces-existing-session` · **Severity:** medium · **Confidence:** high

### Trace
1. **entrypoint** `node_modules/@supabase/auth-js/dist/module/lib/helpers.js:66` (parseParametersFromURL) — During client initialization, reads every fragment and query parameter of the current page URL (any route the attacker links to). Query parameters take precedence over fragment parameters (lines 67-84).
1. **propagation** `apps/web/src/lib/supabase.ts:17` (createSupabaseClient) — createClient(url, anonKey) is called with no auth options. main.tsx:23 creates this client at app start, so it initializes on every route.
1. **propagation** `node_modules/@supabase/auth-js/dist/module/GoTrueClient.js:403` (_initialize) — Any access_token parameter makes _isImplicitGrantCallback true (line 3356). Because detectSessionInUrl is true, _getSessionFromURL runs whether or not a session is already stored.
1. **propagation** `node_modules/@supabase/auth-js/dist/module/GoTrueClient.js:3320` (_getSessionFromURL) — The only check is _getUser(access_token), which confirms the token belongs to some user of the project. The implicit branch has no state, nonce or flow binding (lines 3299-3336).
1. **propagation** `node_modules/@supabase/auth-js/dist/module/GoTrueClient.js:421` (_initialize) — _saveSession(session) overwrites the stored session, then SIGNED_IN is sent to subscribers (line 427).
1. **sink** `apps/web/src/app/session.ts:27` (useSession) — The onAuthStateChange handler copies the new session into React state, so the UI and all later PostgREST and Storage calls act as the attacker's userId.

### Evidence
- `apps/web/src/lib/supabase.ts:17` — createClient(url, anonKey) is called without flowType or detectSessionInUrl options.
- `node_modules/@supabase/auth-js/dist/module/GoTrueClient.js:21` — The default flowType is 'implicit', and detectSessionInUrl defaults to true (line 19). The installed auth-js is 2.119.0; the lockfile pins 2.118.0 under the ^2.118.0 range (package-lock.json:3624).
- `node_modules/@supabase/auth-js/dist/module/GoTrueClient.js:421` — The URL-derived session is saved without checking for an existing session. Only a failed URL login keeps the old session (lines 415-417).
- `apps/web/src/main.tsx:23` — createSupabaseClient runs at startup for every route, outside demo mode.
- `supabase/email-templates/confirm-signup.html:21` — The app's own email links go to /auth/confirm?token_hash=... (recovery.html:21 and invite.html:21 do the same), so the app does not need session pickup from the URL.
- `apps/web/src/routes/ConfirmEmail.tsx:39` — The legitimate email-link sign-in is an explicit auth.verifyEmailLink({ tokenHash, type }) call.

### Principal and resource
An attacker with their own Hoppin account sends a link carrying their own session tokens to a victim who is already signed in.

### Bounded local reproduction (dummy data, sandbox only)
Inputs:
```
https://hoppin.example/trips#access_token=<attacker_access_jwt>&refresh_token=attacker-refresh&expires_in=3600&token_type=bearer
```
```
https://hoppin.example/join/abc?access_token=<attacker_access_jwt>&refresh_token=attacker-refresh&expires_in=3600&token_type=bearer
```

Steps:
1. In the network-less node:20 sandbox, mock window (location, history), document, localStorage, WebSocket and fetch. The mock GET /auth/v1/user maps dummy JWTs to user ids 1111... (victim) and 2222... (attacker).
2. Store a victim session (user 11111111-1111-4111-8111-111111111111, refresh_token victim-refresh) under sb-dummyref-auth-token.
3. Set window.location.href to a payload URL, then call createClient('http://dummyref.supabase.local','dummy-anon-key') from /target/node_modules/@supabase/supabase-js/dist/index.mjs with no options, matching apps/web/src/lib/supabase.ts:17.
4. Subscribe to onAuthStateChange, call getSession(), and read back the stored session.
5. As a control, repeat with { auth: { flowType: 'pkce', detectSessionInUrl: false } }.

### Observed result and the invariant it proves
With default options, both payloads gave the same result: flowType was implicit and detectSessionInUrl was true. getSession() returned user 22222222-2222-4222-8222-222222222222 (the attacker), storage held refresh_token attacker-refresh, and the events were INITIAL_SESSION:2222... then SIGNED_IN:2222.... The only network call was GET /auth/v1/user. In the query-string variant the tokens stayed in the URL. With the proposed options, the victim's session (1111..., victim-refresh) was kept and no network call was made.

Intended invariant: A session should be set only by a sign-in this browser started (a PKCE code plus a stored verifier) or by an explicit token_hash verification on /auth/confirm. A URL carrying bearer tokens should be ignored, and it must never replace an existing session without the user's action.

### Conditions and containment
- **user_interaction:** A victim who is already signed in to Hoppin in the browser opens an attacker-crafted Hoppin URL with token parameters in the fragment or query string.
- **authentication_level:** The attacker holds a valid access and refresh token for an account of their own in the same Supabase project.
- **third_party_dependency:** supabase-js/auth-js v2 defaults (2.119.0 installed, 2.118.0 locked) with implicit flowType and detectSessionInUrl enabled.

### Remediation
Turn off session pickup from the URL and use PKCE. The app signs people in only by password and by token_hash verification on /auth/confirm. Add a regression test in which a stored session survives a page load whose URL carries another account's tokens.

`apps/web/src/lib/supabase.ts`

```
export function createSupabaseClient(env: SupabaseEnv) {
  const { url, anonKey } = readSupabaseEnv(env);
  return createClient(url, anonKey, { auth: { flowType: "pkce", detectSessionInUrl: false } });
}
```

Regression case: re-run the reproduction above after the fix; the observed result must no longer occur.

---

## Client-supplied documents.storage_path lets any authenticated user who knows an object path (including removed members and demoted organizers) read other trips' and other members' private files

**Fingerprint:** `hoppin:documents.storage_path-unbound:storage-select-trusts-any-visible-row` · **Severity:** medium · **Confidence:** high

### Trace
1. **entrypoint** `supabase/migrations/001_core.sql:248` (documents_insert policy (PostgREST POST /documents)) — Any authenticated user who is an approved member of some trip (trivially one they just created with create_trip, 001_core.sql:119) inserts a documents row with an arbitrary storage_path. Only trip membership and owner_id are checked (line 249).
1. **propagation** `supabase/migrations/001_core.sql:250` (documents_update policy (PostgREST PATCH /documents)) — The row owner can rewrite storage_path on an existing row to any value. The using and with check clauses do not restrict that column.
1. **propagation** `supabase/migrations/001_core.sql:243` (documents_select policy) — The planted row is visible to its owner, who is an approved member of the planting trip, so it satisfies the EXISTS subquery evaluated under the caller's RLS.
1. **sink** `supabase/migrations/008_storage.sql:37` (trip_documents_select on storage.objects) — A read is granted for any object whose name matches the storage_path of a visible documents row, whatever trip or uploader folder the object is in. This is the check behind storage download and createSignedUrl (apps/web/src/lib/documents.ts:103).

### Evidence
- `supabase/migrations/008_storage.sql:37` — `exists (select 1 from public.documents d where d.storage_path = name)` does not tie d.trip_id or d.owner_id to the object's folder components.
- `supabase/migrations/001_core.sql:249` — `with check (is_approved_member(trip_id) and owner_id = auth.uid())` does not constrain storage_path.
- `supabase/migrations/001_core.sql:252` — The documents_update with check clause does not constrain storage_path either.
- `supabase/migrations/001_core.sql:63` — `storage_path text not null` has no check constraint. No trigger or later migration (grep of supabase/migrations) constrains it.
- `apps/web/src/lib/documents.ts:56` — The correct `<trip>/<owner>/<id>-<name>` path is built only on the client, which is not a control against direct PostgREST calls.
- `supabase/migrations/007_invites_profiles.sql:150` — remove_member only sets status='removed'. Revocation depends on the RLS predicates that the planted row bypasses.
- `supabase/migrations/010_account.sql:46` — set_member_role only updates role. A demoted organizer previously saw personal-document paths through the organizer clause of documents_select (001_core.sql:246).
- `agents/v3-07/artifacts/evidence-1.txt:1` — Independent verifier run in the PGlite sandbox. A removed member's read went from 0 to 1 after planting a row in a new trip. A never-member outsider's read of a personal passport object went from 0 to 1. Rewriting storage_path with UPDATE granted a read of another member's personal object.

### Principal and resource
A trip member who is later removed (or an organizer who is later demoted), or any authenticated user holding a leaked object path, who wants to read a private trip-documents object they are no longer, or were never, entitled to.

### Bounded local reproduction (dummy data, sandbox only)
Inputs:
```
select create_trip('Mine')  -- returns <newTrip>
```
```
insert into documents (trip_id, owner_id, scope, storage_path, kind) values ('<newTrip>', '<attacker uid>', 'personal', '<tripB>/<uploader>/<docId>-<name>', 'x')
```
```
update documents set storage_path = '<tripB>/<otherMember>/<docId>-passport.pdf' where owner_id = '<attacker uid>'
```
```
select name from storage.objects where bucket_id = 'trip-documents' and name = '<tripB>/<uploader>/<docId>-<name>'
```

Steps:
1. In the no-network sandbox, load supabase/test/bootstrap.sql and then every supabase/migrations/*.sql file in sorted order into PGlite.
2. As superuser, seed dummy users O (organizer), M and P (approved members) of trip B, plus outsider X. Add storage.objects rows and documents rows for a shared object B/O/<d1>-ticket.pdf and a personal object B/P/<d2>-passport.pdf.
3. Impersonate each user with `set local role authenticated` and `request.jwt.claim.sub`. As O, call remove_member(B, M), then confirm M can no longer read the shared object (0 rows).
4. As M, call create_trip, insert a documents row in the new trip whose storage_path is the trip B shared object name, and select the object again.
5. As X, check that the personal object is unreadable (0 rows). Then call create_trip, plant a row pointing at the personal object, and select it again.
6. As M, update the storage_path of the planted row to the personal object path, then select that object.

### Observed result and the invariant it proves
Removed member M: 0 rows before planting and 1 row after. Outsider X, never a member of trip B: 0 rows for P's personal passport object before planting and 1 row after. Update path: M read P's personal object (1 row) after rewriting storage_path. The control check that M as an approved member could not read P's personal object returned 0. Recorded in evidence-1.txt.

Intended invariant: The header comment in 008_storage.sql:7-8 says a file may be opened only if the matching documents row is visible to the caller, and that the documents rules already hide personal documents from other members. That row must be the object's own record: same trip folder and same uploader folder. Removing, leaving or demoting a member must revoke read access to files they are no longer entitled to, and users with no membership in the object's trip must never be able to read it.

### Conditions and containment
- **authentication_level:** The attacker has a Supabase account (an authenticated JWT) and can call PostgREST and Storage directly.
- **authorization_role:** The attacker is an approved member of at least one trip in which to plant the row. Any authenticated user gets this through create_trip. No membership in the victim trip is needed at the time of the read.
- **data_state:** The attacker knows the target object's full path (<trip>/<uploader>/<doc uuid>-<name>). They can learn it while an approved member (shared documents) or an organizer (personal documents), or from any other leak of storage_path. Random document UUIDs make blind guessing infeasible.
- **system_configuration:** Hosted Supabase Storage evaluates the storage.objects SELECT RLS policy under the caller's JWT for download and createSignedUrl. This matches the local stub, but the Storage API was not exercised locally.

### Remediation
Bind every documents row to its own trip and uploader folder when it is written, make storage_path and trip_id immutable, and make the storage select policy require that the matching documents row belongs to the object's own trip folder. A row in another trip, or one pointing at another uploader's folder, can then never authorize a read.

`supabase/migrations/016_document_path_binding.sql`

```
drop policy documents_insert on documents;
create policy documents_insert on documents for insert to authenticated
  with check (
    is_approved_member(trip_id) and owner_id = auth.uid()
    and split_part(storage_path, '/', 1) = trip_id::text
    and split_part(storage_path, '/', 2) = auth.uid()::text
  );

create function documents_before_update() returns trigger language plpgsql as $$
begin
  if new.storage_path <> old.storage_path or new.trip_id <> old.trip_id then
    raise exception 'storage_path and trip_id of a document cannot change';
  end if;
  return new;
end $$;
create trigger documents_before_update before update on documents
  for each row execute function documents_before_update();

drop policy trip_documents_select on storage.objects;
create policy trip_documents_select on storage.objects for select to authenticated
  using (
    bucket_id = 'trip-documents'
    and (
      exists (select 1 from public.documents d
              where d.storage_path = name
                and d.trip_id = try_uuid((storage.foldername(name))[1]))
      or (owner = auth.uid() and is_approved_member(try_uuid((storage.foldername(name))[1])))
    )
  );
```

Regression case: re-run the reproduction above after the fix; the observed result must no longer occur.

---

## Unvalidated items.tz lets any trip member poison the shared digest job and the trip's Days screen

**Fingerprint:** `supabase/migrations/001_core.sql:items.tz-unvalidated-timezone` · **Severity:** medium · **Confidence:** high

### Trace
1. **entrypoint** `supabase/migrations/001_core.sql:214` (items_insert RLS policy) — authenticated has INSERT on items (line 192). items_insert only requires is_approved_member(trip_id) and owner_id = auth.uid(), so any approved member can write any tz value through PostgREST. items_update (line 216) likewise allows editors to change tz.
1. **propagation** `supabase/migrations/001_core.sql:37` (items.tz column) — tz text not null has no CHECK or trigger validation, so 'Not/AZone' is stored. end_tz (011_end_tz.sql:3) is also unchecked. No later migration adds validation.
1. **propagation** `supabase/migrations/009_trip_delete.sql:10` (items_log_change (replacing the 001 version)) — to_jsonb(new), including tz, is copied into change_log.after. The change_log_queue_digest trigger (006_notifications.sql:67-78) then sets digest_queue.pending_since.
1. **propagation** `supabase/migrations/006_notifications.sql:118` (claim_digest_batch) — Waiting trips are selected ordered by pending_since and limited to p_max_trips, with no skip for trips that failed before.
1. **propagation** `supabase/functions/send-digest/index.ts:16` (MAX_TRIPS) — Fixed global per-run cap of 50 trips passed as p_max_trips.
1. **propagation** `packages/core/src/digest.ts:134` (buildDigest) — The stored tz is carried into the DigestChange unchanged; only null or empty falls back to UTC.
1. **propagation** `supabase/functions/send-digest/run.ts:126` (sendDigests recipient loop) — digestEmail calls describeChange for each recipient with an email (email_digest defaults to true). This happens before record_digests at line 129.
1. **propagation** `packages/core/src/digest.ts:171` (describeChange) — For an 'added' change with starts_at (always set), it calls when(startsAt, tz). Changed time/end fields reach when() through show().
1. **propagation** `packages/core/src/digest.ts:156` (when) — new Intl.DateTimeFormat('en-GB', {timeZone: tz, ...}) throws RangeError: Invalid time zone specified.
1. **sink** `supabase/functions/send-digest/run.ts:143` (sendDigests per-trip catch) — The exception is caught, failedTrips is incremented, and the job logs 'it stays waiting for the next run'. record_digests is skipped, so through_id and pending_since never advance and the trip is claimed first again on every run.

### Evidence
- `supabase/migrations/001_core.sql:37` — tz text not null, with no format constraint.
- `supabase/migrations/011_end_tz.sql:3` — end_tz text, with no format constraint.
- `apps/web/src/components/ItemForm.tsx:115` — isZone() validation exists only in the client form (defined at line 29). Direct PostgREST writes bypass it.
- `supabase/migrations/006_notifications.sql:113` — The result is ordered by pending_since over trips limited by p_max_trips (lines 115-119).
- `supabase/migrations/006_notifications.sql:137` — record_digests is the only place that advances through_id and pending_since.
- `supabase/functions/send-digest/run.ts:129` — record() runs only after every recipient's email has been rendered, so a render throw skips it.
- `apps/web/src/routes/DaysScreen.tsx:158` — planZone(snapshot.items, date, ...) runs during render. It calls localDate → instantToZonedInput → offsetMs (packages/core/src/time.ts:3), which throws for an invalid tz. No ErrorBoundary was found in apps/web/src.
- `agents/v3-08/artifacts/evidence-1.txt:1` — Sandbox run of the repository's own sendDigests (run.ts) and digest.ts/time.ts, with only TypeScript type syntax removed, against PGlite with bootstrap.sql and all migrations.

### Principal and resource
An authenticated user who can create trips, invite a second account they control, and write items through PostgREST with their own JWT.

### Bounded local reproduction (dummy data, sandbox only)
Inputs:
```
insert into items (trip_id, owner_id, kind, visibility, starts_at, tz, title) values (<own trip>, <self>, 'plan', 'shared', '2026-12-01T10:00:00Z', 'Not/AZone', 'x')
```

Steps:
1. In the sandbox, load supabase/test/bootstrap.sql and every supabase/migrations/*.sql into PGlite. Load the repository's run.ts, digest.ts and time.ts with only TypeScript type syntax removed.
2. As authenticated user A, call create_trip three times. For each trip, A calls create_invite, B calls redeem_invite, and A calls approve_member for B. Then A inserts the payload item into each trip.
3. As victim organizer V, create a separate trip with approved member W and insert a normal item with tz 'Asia/Kolkata'.
4. As superuser, simulate elapsed time: set change_log.changed_at and digest_queue.pending_since 2 hours back for the attacker trips and 1 hour back for the victim trip.
5. Call the real sendDigests twice. Its claim step runs claim_digest_batch(300, 3, 500) as service_role, its record step runs record_digests as service_role, and sendEmails is mocked. Then run it once more with p_max_trips=4 as a control.

### Observed result and the invariant it proves
All three inserts of tz 'Not/AZone' were accepted. On both runs with p_max_trips=3, sendDigests reported {trips:3, notified:0, emailed:0, failedTrips:3}. record_digests was never called, and the job logged 'a trip could not be processed; it stays waiting for the next run' three times. digest_queue kept through_id=0 and pending set for every trip, including the victim trip, and the notifications table had 0 rows. The control run with p_max_trips=4 processed 'Victim trip' (notified 1, emailed w@example.test, through_id 4). The repository's time.ts planZone with the poisoned item threw 'RangeError: Invalid time zone specified: Not/AZone' (node v20.20.2).

Intended invariant: Only valid IANA time zone names should be stored in tz/end_tz, enforced in the database (for example a trigger checking pg_timezone_names). The digest job should not let one trip's data stop other trips: it should render defensively (fall back to UTC or omit the time) and quarantine or advance a trip that fails repeatedly. Client zone formatting should be guarded so one item cannot break the screen for all members.

### Conditions and containment
- **authentication_level:** The attacker has two ordinary signed-up accounts. A creates trips with create_trip and so becomes organizer. B joins through create_invite, redeem_invite and approve_member. For the trip-local Days screen impact, approved membership in the victim trip is enough.
- **data_state:** Each poisoned trip has at least one approved member other than the writer whose email_digest is on (the default), so the email render path runs. Starving all other trips requires at least MAX_TRIPS (50) poisoned trips. Only trips whose pending_since is newer than the poisoned trips' are blocked.
- **system_configuration:** send-digest is deployed with MAX_TRIPS=50 and scheduled by pg_cron as documented in supabase/ops/schedule-digest.sql. Deno uses the same V8 Intl, which rejects unknown zones.

### Remediation
Constrain tz and end_tz to valid IANA names in the database, and clean up existing rows. Make the digest renderer fall back to UTC for an unusable zone. Quarantine or advance trips that fail repeatedly, so one trip cannot hold the head of the queue. Guard client zone formatting, or add an error boundary around it.

`supabase/migrations/016_item_tz_check.sql`

```
create function is_valid_tz(p text) returns boolean language sql stable as $$ select exists (select 1 from pg_timezone_names where name = p) $$;
update items set tz = 'UTC' where not is_valid_tz(tz);
update items set end_tz = null where end_tz is not null and not is_valid_tz(end_tz);
create function items_check_tz() returns trigger language plpgsql as $$ begin
  if not is_valid_tz(new.tz) or (new.end_tz is not null and not is_valid_tz(new.end_tz)) then raise exception 'unknown time zone'; end if;
  return new; end $$;
create trigger items_check_tz before insert or update of tz, end_tz on items for each row execute function items_check_tz();
```

`packages/core/src/digest.ts`

```
function when(iso: string, tz: string): string {
  const date = new Date(iso);
  let zone = tz;
  try { new Intl.DateTimeFormat("en-GB", { timeZone: zone }); } catch { zone = "UTC"; }
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: zone, weekday: "short", day: "numeric", month: "short" }).format(date);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  return `${day}, ${time}`;
}
```

Regression case: re-run the reproduction above after the fix; the observed result must no longer occur.

---

## One user can stop notifications for every other trip by filling the global digest queue with trips that always fail

**Fingerprint:** `supabase/migrations/006_notifications.sql:claim_digest_batch:global-oldest-first-no-tenant-fairness-no-failure-quarantine` · **Severity:** medium · **Confidence:** high

### Trace
1. **entrypoint** `supabase/migrations/013_trip_destination.sql:14` (create_trip) — Any authenticated user can create any number of trips and becomes their approved organizer. The only check is that auth.uid() is not null.
1. **propagation** `supabase/migrations/001_core.sql:214` (items_insert policy) — An approved member can insert items freely. items.tz (001:37) is free text with no validation.
1. **propagation** `supabase/migrations/006_notifications.sql:71` (change_log_queue_digest) — Every change_log insert (from items_log_change) puts the trip in the global digest_queue with pending_since set, unless it is already waiting.
1. **propagation** `supabase/migrations/006_notifications.sql:115` (claim_digest_batch) — Ready trips are taken globally, oldest pending_since first, with LIMIT p_max_trips. There is no per-owner fairness and no failure state.
1. **propagation** `supabase/functions/send-digest/index.ts:38` (claim) — p_max_trips is MAX_TRIPS=50 for each run, and pg_cron fires a run every 5 minutes.
1. **propagation** `supabase/functions/send-digest/run.ts:126` (sendDigests) — For a recipient with email on, digestEmail calls describeChange, which calls when() and then Intl.DateTimeFormat with the item's tz. An invalid zone throws RangeError before record runs.
1. **sink** `supabase/functions/send-digest/run.ts:144` (sendDigests catch) — A failed trip is only counted and logged. record_digests is never called, so the trip keeps its oldest-first slot in every later run and other tenants' trips are never claimed.

### Evidence
- `supabase/migrations/006_notifications.sql:118` — order by dq.pending_since, then limit p_max_trips: a single global FIFO with no tenant dimension and no attempt or backoff column.
- `supabase/functions/send-digest/index.ts:16` — MAX_TRIPS = 50 per run.
- `supabase/functions/send-digest/run.ts:145` — A failing trip 'stays waiting for the next run'. There is no attempt limit or backoff.
- `supabase/migrations/013_trip_destination.sql:27` — create_trip only rejects a null auth.uid(). There is no quota.
- `packages/core/src/digest.ts:171` — For an 'added' change, describeChange calls when(startsAt, tz). starts_at is NOT NULL, so this is always reached.
- `packages/core/src/digest.ts:156` — Intl.DateTimeFormat({ timeZone: tz }) throws on an invalid tz taken from item rows written by the attacker.
- `supabase/ops/schedule-digest.sql:18` — The job runs every 5 minutes, so global capacity is fixed at 50 trips per 5 minutes.

### Principal and resource
An ordinary authenticated user, with a second account they control, using direct PostgREST and RPC access only inside their own trips.

### Bounded local reproduction (dummy data, sandbox only)
Inputs:
```
50 x as user A: rpc create_trip('tN'); rpc create_invite(trip) -> token; as user B: rpc redeem_invite(token); as A: rpc approve_member(trip, B)
```
```
50 x as A: insert into items (trip_id, owner_id, kind, visibility, starts_at, tz, title) values (trip, A, 'plan', 'shared', now(), 'Not/AZone', 'x')
```
```
dummy victim V: create_trip('victim trip'), member W joined the same way, one shared item with tz 'Europe/Paris'
```
```
fixture: digest_queue.pending_since set to now()-20min for A's trips and now()-10min for V's trip (simulated elapsed time)
```
```
3 runs of the real sendDigests(deps), where deps.claim = claim_digest_batch(300,50,500) and deps.record = record_digests(...) as service_role, and sendEmails is mocked
```

Steps:
1. Run inside the parent-approved sandbox: run.sh v3-11 170 node /scratch/h1.mjs. It has no network, the target is read-only, and limits are 768 MiB and 1 CPU.
2. The harness loads PGlite with supabase/test/bootstrap.sql and all migrations in sorted order. It impersonates users with set local role authenticated and request.jwt.claim.sub.
3. It loads the real supabase/functions/send-digest/run.ts and packages/core/src/digest.ts after only mechanically stripping the TypeScript type annotations. It then calls sendDigests against the real claim_digest_batch and record_digests functions.
4. It records each run's SendResult and the victim's digest_queue and notifications state to /scratch/evidence-1.txt.

### Observed result and the invariant it proves
All 50 attacker trips accepted tz='Not/AZone'. 51 trips were ready. Runs 1, 2 and 3 each returned {trips:50, notified:0, emailed:0, failedTrips:50} and logged 'a trip could not be processed; it stays waiting for the next run'. After 3 runs, all 50 attacker trips were still pending at their original pending_since. The victim's digest_queue row stayed at through_id=0, pending, with 0 notifications. A partial control run deleted one attacker trip's bad item. That run then showed failedTrips:49, so the trip that no longer threw was recorded. The victim was still not claimed in that run because the trip without the bad item still held a slot. The next run, which would have reached the victim, was not executed because of the wall-clock limit.

Intended invariant: Each tenant's ready trips should be claimed within a bounded delay whatever other users do. Trips that fail repeatedly should be moved aside with an attempt count and backoff, or a dead-letter state, instead of being retried at the head of the queue. Per-owner trip creation and enqueue volume should be bounded so one principal cannot use up the shared per-run budget.

### Conditions and containment
- **authentication_level:** The attacker is an ordinary signed-in user. They need no role in any victim trip.
- **data_state:** For the full starvation shown here, the attacker needs about 50 trips. Each needs a shared item that makes processing throw, for example an invalid items.tz, which is also tracked under its own tz-validation fingerprint. Each also needs another approved member with email_digest on and a non-null email, for example the attacker's second account that redeemed the attacker's invite and was approved.
- **timing_dependency:** The attacker's pending changes must be older than the victim's. They stay that way for good once the attacker's trips are queued first, because failing trips never get a new pending_since.

### Remediation
Make digest claiming fair across tenants and resistant to failures. Add attempt_count and next_attempt_at to digest_queue. When a trip fails, increment the count and back off, with a dead-letter state after N failures, and skip trips that are not yet due when claiming. Interleave claims per owner, for example with a row_number partitioned by trips.created_by and capped at a small number per run. Add per-user caps on trips created and on item writes per window. Separately, validate items.tz and items.end_tz against pg_timezone_names, and catch per-change formatting errors in digestEmail and describeChange so one bad row cannot fail a whole trip.

`supabase/migrations/016_digest_fairness.sql`

```
alter table digest_queue add column attempts int not null default 0, add column next_attempt_at timestamptz;
create or replace function digest_mark_failed(p_trip uuid) returns void language sql security definer set search_path = public as $$
  update digest_queue set attempts = attempts + 1, next_attempt_at = now() + make_interval(mins => least(5 * power(2, attempts)::int, 1440)) where trip_id = p_trip
$$;
-- in claim_digest_batch: where dq.pending_since is not null and (dq.next_attempt_at is null or dq.next_attempt_at <= now()) and dq.attempts < 10
--   and select at most 5 trips per trips.created_by per run (row_number() over (partition by t.created_by order by dq.pending_since) <= 5)
-- record_digests: reset attempts = 0, next_attempt_at = null on success
revoke execute on function digest_mark_failed(uuid) from public, anon, authenticated;
grant execute on function digest_mark_failed(uuid) to service_role;
```

`supabase/functions/send-digest/run.ts`

```
} catch {
  result.failedTrips += 1;
  await deps.markFailed(batch.trip_id).catch(() => {});
  deps.log("a trip could not be processed; it is retried later with backoff");
}
```

Regression case: re-run the reproduction above after the fix; the observed result must no longer occur.

---

## Account deletion leaves removed-member personal files and solo-trip shared files in storage

**Fingerprint:** `supabase/migrations/010_account.sql:delete_my_account:storage-cleanup-misses-rls-hidden-and-cascaded-documents` · **Severity:** medium · **Confidence:** high

### Trace
1. **entrypoint** `apps/web/src/routes/AccountScreen.tsx:68` (AccountScreen/deleteAccount) — The signed-in user confirms 'Delete my account', which calls actions.deleteAccount().
1. **propagation** `apps/web/src/app/services.tsx:225` (createServices/deleteAccount) — Collects storage paths with a documents query under row-level security (owner_id=me, scope='personal'), removes only those files, then calls delete_my_account.
1. **propagation** `supabase/migrations/001_core.sql:243` (documents_select) — Requires is_approved_member(trip_id), so a removed member's own personal rows are not returned. Shared rows are excluded by the client's scope filter.
1. **propagation** `supabase/migrations/010_account.sql:110` (delete_my_account) — Deletes trips with no other approved member. Their documents rows cascade-delete without their files being removed.
1. **sink** `supabase/migrations/010_account.sql:114` (delete_my_account) — Deletes all of the caller's personal documents rows, including those in trips they were removed from. storage.objects are never touched, so the files stay.

### Evidence
- `apps/web/src/routes/AccountScreen.tsx:154` — The confirmation dialog promises: 'Deletes your account, your private plans and personal documents'.
- `supabase/migrations/010_account.sql:87` — The function contract says 'The app removes the person's uploaded files from storage first.'
- `supabase/migrations/010_account.sql:66` — leave_trip raises an error for a removed member, so it cannot be used to purge their personal documents.
- `supabase/migrations/010_account.sql:152` — Deleting files in your own storage folder requires is_approved_member, so a removed member cannot delete their own files.
- `supabase/migrations/001_core.sql:254` — documents_delete requires is_approved_member.
- `supabase/migrations/001_core.sql:59` — documents.trip_id references trips with on delete cascade, so deleting a solo trip drops its document rows.
- `supabase/migrations/007_invites_profiles.sql:150` — remove_member only sets status='removed'. It does not clean up the member's documents or files.
- `supabase/migrations/008_storage.sql:37` — Storage read access is granted by any visible documents row with a matching storage_path. A leftover file can be exposed again by inserting such a row.
- `apps/web/src/app/services.tsx:211` — For comparison, deleteTrip removes the files of every document in the trip before deleting it. The account-deletion path has no equivalent for solo trips.

### Principal and resource
An ordinary signed-in user deletes their account and expects their files to be erased. The party that gains access is anyone who can reach the leftover bucket object afterwards: operators, or a trip organizer who re-references the known path.

### Bounded local reproduction (dummy data, sandbox only)
Inputs:
```
As member M (approved): insert into storage.objects ('trip-documents','<trip>/<M>/d1-dummy-personal.txt'); insert into documents (scope='personal', storage_path=same)
```
```
As organizer O: select remove_member('<trip>','<M>')
```
```
As M: select storage_path from documents where owner_id='<M>' and scope='personal'; select delete_my_account()
```
```
As O afterwards: insert into documents (trip_id,owner_id,scope,storage_path,kind) values ('<trip>','<O>','shared','<trip>/<M>/d1-dummy-personal.txt','other'); select name from storage.objects where name='<that path>'
```
```
As solo user S: create_trip; upload one shared and one personal object with documents rows; remove the personal path returned by the client query; select delete_my_account()
```

Steps:
1. Run run.sh v3-12 150 node /scratch/v.mjs (no network, read-only target). It loads bootstrap.sql and all 12 migrations into PGlite.
2. Create trips through create_trip and act as each dummy user with 'set local role authenticated' and request.jwt.claim.sub set.
3. Copy the client's deleteAccount steps (the documents query, then deleting the returned paths), call delete_my_account, and check storage.objects as superuser.

### Observed result and the invariant it proves
Case A: after remove_member, M's client query returned []. M's storage delete and documents delete each affected 0 rows, and leave_trip raised 'you are not a member of this trip'. delete_my_account succeeded, and the auth.users row and documents row were gone. The storage object '<trip>/<M>/d1-dummy-personal.txt' (owner=M) remained. O could not read it with no documents row. After O inserted a shared documents row with that path, O could select the object. Case B: the client removed only the personal file. delete_my_account deleted the trip and both documents rows, and the shared object '<solo>/<S>/d2-dummy-shared.txt' (owner=S) remained.

Intended invariant: Every document row that account deletion removes, directly or through a trip cascade, should have its stored file removed. A member removed from a trip should still be able to delete their own personal documents and files in that trip.

### Conditions and containment
- **data_state:** Case A: the user uploaded a personal document in a trip and was later removed by an organizer. Case B: the user is the only approved member of a trip that has shared documents (no blocker is raised).
- **authentication_level:** The deleting user is signed in. Reading the leftover file later needs operator or service access, or an approved trip member who knows the path and uses the storage_path re-reference behaviour.
- **system_configuration:** Assumes hosted Supabase storage.objects.owner has no foreign key to auth.users that would block deleting the user (the local stub has none). In hosted Storage, file bytes are only removed through the Storage API, so server-side SQL that deletes rows from storage.objects would not free them.

### Remediation
Make file cleanup cover exactly the rows the server deletes. Add a SECURITY DEFINER function that returns every storage_path delete_my_account will remove: the caller's personal documents in all trips whatever their status, plus all documents of trips that will be deleted with the account. Remove those files through the Storage API, from the client under a policy that allows it or from a service-role edge function, before calling delete_my_account. Hosted Storage file bytes must not be deleted with raw SQL on storage.objects. Let a removed member delete files in their own folder, and add a way for them to purge their own personal documents. Add regression tests: after remove_member then delete_my_account, and after a solo-trip delete_my_account, no storage.objects row should remain for the deleted rows.

`supabase/migrations/016_account_files.sql`

```
create function my_deletion_file_paths() returns setof text
language sql stable security definer set search_path = public
as $$
  select d.storage_path from documents d where d.owner_id = auth.uid() and d.scope = 'personal'
  union
  select d.storage_path from documents d
  where d.trip_id in (
    select t.id from trips t
    where (t.id in (select trip_id from members where user_id = auth.uid()) or t.created_by = auth.uid())
      and not exists (select 1 from members x where x.trip_id = t.id and x.status = 'approved' and x.user_id <> auth.uid())
  )
$$;
revoke execute on function my_deletion_file_paths() from public, anon;
grant execute on function my_deletion_file_paths() to authenticated;

drop policy trip_documents_delete on storage.objects;
create policy trip_documents_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'trip-documents'
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or is_organizer(try_uuid((storage.foldername(name))[1]))
    )
  );
```

`apps/web/src/app/services.tsx`

```
const { data: paths, error: pathsError } = await client.rpc("my_deletion_file_paths");
if (pathsError) throw new Error(pathsError.message);
await removeFiles((paths ?? []) as string[]);
const { error } = await client.rpc("delete_my_account");
```

Regression case: re-run the reproduction above after the fix; the observed result must no longer occur.

---

## Anonymous callers can fill the sign-up queue with arbitrary third-party emails that the operator's hourly job then invites

**Fingerprint:** `supabase/migrations/014_signup_queue.sql:join_signup_queue-anon-unbound-enqueue` · **Severity:** medium · **Confidence:** medium

### Trace
1. **entrypoint** `supabase/migrations/014_signup_queue.sql:140` (grant execute on function signup_queue_status(text), join_signup_queue(text, text) to anon, authenticated) — join_signup_queue is explicitly executable by anon, so it can be called with the public anon key through PostgREST /rest/v1/rpc/join_signup_queue. This explicit grant does not depend on Supabase default privileges.
1. **propagation** `supabase/migrations/014_signup_queue.sql:66` (join_signup_queue) — The only input validation is an email-syntax regex and a 254-character length limit. Lines 69-74 return early only when the address already has an account or a queue row. No caller identity, proof of address or rate-limit event is checked.
1. **propagation** `supabase/migrations/014_signup_queue.sql:75` (join_signup_queue) — The single global bound is the count of waiting rows against max_waiting. Once an attacker fills it, every later caller gets 'full'. Line 78 then inserts the attacker-supplied email and display_name.
1. **propagation** `supabase/functions/drain-signup-queue/index.ts:28` (drain claim) — The hourly job, running as service_role, calls claim_signup_queue, which returns the oldest waiting rows, including the attacker-supplied email and display_name (014:90-115).
1. **sink** `supabase/functions/drain-signup-queue/index.ts:33` (drain invite) — admin.auth.admin.inviteUserByEmail(email, {redirectTo, data:{display_name}}) sends operator invite mail to the attacker-chosen address and creates the auth user with the attacker-chosen display_name. drain.ts:80-85 calls it for each claimed row.

### Evidence
- `apps/web/src/components/AuthForm.tsx:113` — The over-the-email-limit condition is checked only client-side, before api.joinQueue is called at line 116. The RPC itself does not enforce it.
- `apps/web/src/components/AuthForm.tsx:107` — When queueStatus returns 'waiting' for an address, the UI shows 'in queue' and never calls signUp. A third-party queue row therefore also diverts the real owner's normal UI sign-up until the row is invited.
- `supabase/migrations/014_signup_queue.sql:26` — max_waiting defaults to 2000 and is a single global setting, not a per-requester limit. batch_size defaults to 10 (line 24), so a full queue takes about 200 hourly runs to drain.
- `supabase/migrations/014_signup_queue.sql:33` — Direct table access is revoked from anon and authenticated, so the SECURITY DEFINER RPC is the only write path, and it carries no requester bound.
- `docs/signup-queue.md:84` — Invites share Supabase rate_limit_email_sent (30 per hour) and the Resend daily cap with password resets and confirmation emails.
- `supabase/functions/drain-signup-queue/drain.ts:82` — Each claimed row is invited unconditionally. The job only stops early when the email service reports a rate limit, which means it drains the shared email budget up to that limit every hour.

### Principal and resource
Unauthenticated web client holding the public anon key, calling the PostgREST RPC as the anon role.

### Bounded local reproduction (dummy data, sandbox only)
Inputs:
```
select join_signup_queue('t0@victim.test','Chosen Name 0')
```
```
select join_signup_queue('real.person@example.test','Real')
```

Steps:
1. In the sandbox, load supabase/test/bootstrap.sql and every supabase/migrations/*.sql file in sorted order into PGlite. Grant only USAGE on schema public to anon, authenticated and service_role, with no Supabase default privileges. Set signup_queue_settings.max_waiting = 3 as a bounded stand-in for 2000.
2. As role anon, call join_signup_queue for three third-party addresses with chosen display names, then once for a case-variant duplicate.
3. As role anon, call join_signup_queue for a legitimate address, then signup_queue_status for that address.
4. As role anon, try a direct insert into signup_queue, an update of signup_queue_settings, and a call to claim_signup_queue.
5. As service_role, call claim_signup_queue(), which is the input the drain job passes to inviteUserByEmail.

### Observed result and the invariant it proves
anon had EXECUTE on join_signup_queue. All three third-party addresses returned 'queued', and the case-variant duplicate returned 'already_queued'. The legitimate join then returned 'full', and its status stayed 'none'. anon was denied the direct insert into signup_queue, the update of signup_queue_settings, and the call to claim_signup_queue. service_role claim_signup_queue returned exactly the three attacker-supplied emails with display names 'Chosen Name 0' to 'Chosen Name 2'. drain-signup-queue index.ts:33 passes those values to inviteUserByEmail. The actual invite send was not executed: no GoTrue was available and no network was allowed.

Intended invariant: Only an address owner whose own sign-up actually hit the email limit should enter the queue. Anonymous enqueueing should be bounded per requester, so one caller cannot exhaust global capacity or direct operator invite mail, account creation and display names at arbitrary third-party addresses.

### Conditions and containment
- **authentication_level:** None: only the public anon key, which ships in the web app, is needed.
- **system_configuration:** Migration 014 is applied, and drain-signup-queue is deployed and scheduled hourly as documented. No Data API rate limit, CAPTCHA or WAF in front of /rest/v1/rpc/join_signup_queue is visible in source. If a deployed gateway limit exists, it would slow the fill rate but would not add per-requester or ownership binding.
- **data_state:** The queue has free capacity (waiting rows below max_waiting), and the queue is not paused when the attacker wants the invites sent.

### Remediation
Do not let anon create queue rows that cause outbound mail and account creation for unverified addresses. Move enqueueing behind a server-side edge function. That function should verify a CAPTCHA token, apply per-IP and per-domain rate limits, and preferably enqueue only after it has itself observed GoTrue's over_email_send_rate_limit response for that sign-up attempt. It then calls join_signup_queue as service_role. Optionally, at drain time, cap invites per domain and leave headroom so the queue cannot consume the email budget needed for password resets.

`supabase/migrations/016_signup_queue_lockdown.sql`

```
revoke execute on function join_signup_queue(text, text) from anon, authenticated;
-- enqueue only from a server-side edge function that verifies a CAPTCHA token, applies per-IP limits and confirms GoTrue returned over_email_send_rate_limit, calling join_signup_queue as service_role
grant execute on function join_signup_queue(text, text) to service_role;
```

Regression case: re-run the reproduction above after the fix; the observed result must no longer occur.
