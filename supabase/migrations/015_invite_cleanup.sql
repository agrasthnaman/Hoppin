-- Old invite links tidy themselves away. A revoked or expired invite stops working at once and is only kept as a short
-- record; once it is more than 30 days past that, it is deleted. Depends on 007_invites_profiles.sql.

-- Deletes invites that were revoked, or expired, more than p_days days ago. Returns how many were removed.
-- Not callable by app users: run it as the project owner (for example from a schedule, see docs).
create function purge_old_invites(p_days int default 30) returns int
language plpgsql security definer set search_path = public
as $$
declare
  removed int;
begin
  delete from invites
  where least(coalesce(revoked_at, expires_at), expires_at) < now() - make_interval(days => greatest(p_days, 1));
  get diagnostics removed = row_count;
  return removed;
end
$$;
revoke execute on function purge_old_invites(int) from public, anon, authenticated;

-- The same tidy-up happens for a trip whenever its organizer makes a new invite, so it needs no schedule at all.
create or replace function create_invite(p_trip uuid) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v invites;
begin
  if not is_organizer(p_trip) then
    raise exception 'only the organizer can create invites';
  end if;
  delete from invites
  where trip_id = p_trip
    and least(coalesce(revoked_at, expires_at), expires_at) < now() - interval '30 days';
  insert into invites (trip_id, created_by) values (p_trip, auth.uid()) returning * into v;
  return jsonb_build_object('id', v.id, 'token', v.token);
end
$$;
