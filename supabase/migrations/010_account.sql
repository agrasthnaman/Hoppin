-- Account basics: leaving a trip, making and removing organizers, deleting an account, and letting an organizer
-- delete every file of their trip. Depends on 001, 007 and 008.

-- ---------------------------------------------------------------- ownership of an item
-- An item's owner cannot change... except when a trusted database function (running as the function owner) hands
-- a leaving person's group plans to an organizer. Ordinary sessions run as `authenticated`, so they still cannot.
create or replace function items_before_update() returns trigger
language plpgsql
as $$
begin
  if new.trip_id <> old.trip_id then
    raise exception 'trip_id of an item cannot change';
  end if;
  if new.owner_id <> old.owner_id and current_user <> 'postgres' then
    raise exception 'owner_id of an item cannot change';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end
$$;

-- ---------------------------------------------------------------- roles

-- The organizer makes an approved member an organizer, or steps an organizer back to member. The last organizer
-- cannot be demoted, so a trip is never left without one.
create function set_member_role(p_trip uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_organizer(p_trip) then
    raise exception 'only the organizer can change roles';
  end if;
  if p_role not in ('organizer', 'member') then
    raise exception 'unknown role';
  end if;
  if not exists (select 1 from members where trip_id = p_trip and user_id = p_user and status = 'approved') then
    raise exception 'only approved members can have their role changed';
  end if;
  if p_role = 'member' and not exists (
    select 1 from members
    where trip_id = p_trip and status = 'approved' and role = 'organizer' and user_id <> p_user
  ) then
    raise exception 'this is the only organizer: make someone else an organizer first';
  end if;
  update members set role = p_role where trip_id = p_trip and user_id = p_user;
end
$$;

-- ---------------------------------------------------------------- leaving a trip

-- Leave a trip, or withdraw a request to join. Private plans and personal documents in the trip are deleted, replies
-- are withdrawn, group plans stay. A removed member cannot use this (it would let them sidestep being removed), and the
-- only organizer cannot leave.
create function leave_trip(p_trip uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  m members;
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  select * into m from members where trip_id = p_trip and user_id = me;
  if not found or m.status = 'removed' then
    raise exception 'you are not a member of this trip';
  end if;
  if m.role = 'organizer' and m.status = 'approved' and not exists (
    select 1 from members x
    where x.trip_id = p_trip and x.status = 'approved' and x.role = 'organizer' and x.user_id <> me
  ) then
    raise exception 'You are the only organizer. Make someone else an organizer or delete the trip first.';
  end if;
  delete from rsvps where user_id = me and item_id in (select id from items where trip_id = p_trip);
  delete from documents where trip_id = p_trip and owner_id = me and scope = 'personal';
  delete from items where trip_id = p_trip and owner_id = me and visibility = 'private';
  delete from members where trip_id = p_trip and user_id = me;
end
$$;

-- ---------------------------------------------------------------- deleting an account

-- Deletes the signed-in person's account. Refused (and nothing changes) if they are the only organizer of a trip that
-- still has other approved members. Trips with nobody else in them are deleted. Private plans and personal documents
-- are deleted; plans and documents shared with a group are handed to an organizer so bookings survive. The app removes
-- the person's uploaded files from storage first.
create function delete_my_account() returns void
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  t record;
begin
  if me is null then
    raise exception 'not signed in';
  end if;

  for t in
    select tr.id, tr.name from trips tr
    join members m on m.trip_id = tr.id and m.user_id = me and m.role = 'organizer' and m.status = 'approved'
  loop
    if exists (select 1 from members x where x.trip_id = t.id and x.status = 'approved' and x.user_id <> me)
       and not exists (select 1 from members x where x.trip_id = t.id and x.status = 'approved' and x.role = 'organizer' and x.user_id <> me) then
      raise exception 'You are the only organizer of "%". Make someone else an organizer or delete the trip first.', t.name;
    end if;
  end loop;

  -- trips nobody else belongs to go with the account
  delete from trips
  where (id in (select trip_id from members where user_id = me) or created_by = me)
    and not exists (select 1 from members x where x.trip_id = trips.id and x.status = 'approved' and x.user_id <> me);

  delete from documents where owner_id = me and scope = 'personal';
  delete from items where owner_id = me and visibility = 'private';

  -- group plans, documents and trips are handed to another organizer of the same trip
  create temporary table if not exists _heirs (trip_id uuid primary key, heir uuid) on commit drop;
  truncate _heirs;
  insert into _heirs
    select tr.id, (select m.user_id from members m
                   where m.trip_id = tr.id and m.status = 'approved' and m.role = 'organizer' and m.user_id <> me
                   order by m.joined_at limit 1)
    from trips tr
    where tr.created_by = me
       or exists (select 1 from items i where i.trip_id = tr.id and i.owner_id = me)
       or exists (select 1 from documents d where d.trip_id = tr.id and d.owner_id = me);
  update items i set owner_id = h.heir from _heirs h where i.trip_id = h.trip_id and i.owner_id = me and h.heir is not null;
  update documents d set owner_id = h.heir from _heirs h where d.trip_id = h.trip_id and d.owner_id = me and h.heir is not null;
  update trips tr set created_by = h.heir from _heirs h where tr.id = h.trip_id and tr.created_by = me and h.heir is not null;
  -- nobody to hand over to (only possible in odd leftovers): remove instead of leaving a dangling owner
  delete from documents where owner_id = me;
  delete from items where owner_id = me;
  delete from trips where created_by = me;

  delete from invites where created_by = me;
  delete from auth.users where id = me; -- members, profile and replies go with it
end
$$;

revoke execute on function set_member_role(uuid, uuid, text), leave_trip(uuid), delete_my_account() from public;
grant execute on function set_member_role(uuid, uuid, text), leave_trip(uuid), delete_my_account() to authenticated;

-- ---------------------------------------------------------------- storage

-- Own folder, as before, or any file of a trip you organize (so deleting a trip can remove everyone's files).
drop policy trip_documents_delete on storage.objects;
create policy trip_documents_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'trip-documents'
    and (
      ((storage.foldername(name))[2] = auth.uid()::text and is_approved_member(try_uuid((storage.foldername(name))[1])))
      or is_organizer(try_uuid((storage.foldername(name))[1]))
    )
  );

-- Names of trips that stop the signed-in person from deleting their account (they are the only organizer and other
-- approved people are in it). The app checks this before it removes any files, so a refusal leaves nothing broken.
create function my_account_blockers() returns setof text
language sql stable security definer set search_path = public
as $$
  select tr.name
  from trips tr
  join members m on m.trip_id = tr.id and m.user_id = auth.uid() and m.role = 'organizer' and m.status = 'approved'
  where exists (select 1 from members x where x.trip_id = tr.id and x.status = 'approved' and x.user_id <> auth.uid())
    and not exists (select 1 from members x where x.trip_id = tr.id and x.status = 'approved' and x.role = 'organizer' and x.user_id <> auth.uid())
  order by tr.name
$$;
revoke execute on function my_account_blockers() from public;
grant execute on function my_account_blockers() to authenticated;
