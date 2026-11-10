-- Security hardening. Nothing here changes what the app can do: it removes access nobody uses, so a mistake elsewhere
-- (a wrong row rule, a function that forgets to check who is calling) cannot be reached from the public API key.
--
-- Why this is needed: Supabase gives the API roles `anon` (anyone with the public key) and `authenticated` (signed-in
-- people) broad rights on every new table and function by default. The earlier migrations narrowed some of them, but
-- `revoke ... from public` does not remove a right that was granted to `anon` directly. Row rules already denied
-- everything for `anon`, so nothing was exposed, but the rights should not be there.

-- ---------------------------------------------------------------- 1. tables
-- `anon` never touches a table. Signed-in people may only run the commands that have a row rule (a command with no
-- rule is denied anyway). TRUNCATE ignores row rules, so nobody but the owner gets it.
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on change_log, expense_shares, expenses, invites, notifications, poll_options, poll_votes, trip_guests to authenticated;
grant select, insert, update, delete on documents, items to authenticated;
grant select, update on members, profiles to authenticated;
grant select, delete on polls to authenticated;
grant select, insert, delete on rsvps to authenticated;
grant select, update, delete on trips to authenticated;
grant insert on trip_guests to authenticated; -- a member adds a guest (row rule: trip_guests_insert)

-- Future tables start closed: each migration grants exactly what it needs.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;

-- ---------------------------------------------------------------- 2. functions
-- Only the two sign-up queue functions are for people who are not signed in. Functions that only the scheduled jobs
-- use (and the internal expense_snapshot helper) stay service-role only. Trigger functions cannot be called through the API, so they are left alone.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
    if f.proname in ('claim_digest_batch', 'record_digests', 'claim_signup_queue', 'mark_signup_queue', 'purge_old_invites', 'expense_snapshot') then
      execute format('revoke execute on function %s from authenticated', f.sig);
    else
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
    if f.proname in ('signup_queue_status', 'join_signup_queue') then
      execute format('grant execute on function %s to anon', f.sig);
    end if;
  end loop;
end $$;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;

-- ---------------------------------------------------------------- 3. limits on what a signed-in person can store
-- The app already checks these. Checking them in the database too means a hand-made request cannot store a link that
-- runs code when someone taps it (such as javascript:), or a huge row that slows the trip down for everyone.
alter table items
  add constraint items_location_url_web check (location_url is null or (location_url ~* '^https?://[^[:space:]]+$' and length(location_url) <= 2000)),
  add constraint items_title_length check (length(title) <= 200),
  add constraint items_details_size check (pg_column_size(details) <= 20000);
alter table trips add constraint trips_name_length check (length(name) <= 100);
alter table profiles add constraint profiles_display_name_length check (display_name is null or length(display_name) <= 80);

-- ---------------------------------------------------------------- 4. storage
-- Documents are limited to 25 MB in the app; the bucket now enforces it too. (The column exists on Supabase only.)
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
    update storage.buckets set file_size_limit = 26214400 where id = 'trip-documents';
  end if;
end $$;
