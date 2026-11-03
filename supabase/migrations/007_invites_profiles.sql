-- Invites (link-based joining with organizer approval) and profiles (display names).
-- Depends on 001_core.sql.

-- ---------------------------------------------------------------- profiles

create table profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(trim(display_name)) > 0),
  created_at timestamptz not null default now()
);

-- Every new sign-up gets a profile. The name comes from the sign-up form (user metadata);
-- if none was given, the start of the email is used.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into profiles (user_id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Traveller'
    )
  );
  return new;
end
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Is the signed-in user an approved member of a trip that p_user also belongs to (in any status)?
create function shares_trip_with(p_user uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from members me
    join members them on them.trip_id = me.trip_id
    where me.user_id = auth.uid() and me.status = 'approved' and them.user_id = p_user
  )
$$;

alter table profiles enable row level security;
grant select, update on profiles to authenticated; -- rows are created by the sign-up trigger
create policy profiles_select on profiles for select to authenticated
  using (user_id = auth.uid() or shares_trip_with(user_id));
create policy profiles_update on profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- invites

create table invites (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  -- 64 hex characters from two random UUIDs: unguessable, no extension needed
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  revoked_at timestamptz
);
create index invites_trip_idx on invites (trip_id);

alter table invites enable row level security;
grant select on invites to authenticated;
-- Only the trip's organizer can read invites (the token is a secret); changes go through functions.
create policy invites_select on invites for select to authenticated
  using (is_organizer(trip_id));

-- Organizer creates a shareable invite link token for their trip.
create function create_invite(p_trip uuid) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v invites;
begin
  if not is_organizer(p_trip) then
    raise exception 'only the organizer can create invites';
  end if;
  insert into invites (trip_id, created_by) values (p_trip, auth.uid()) returning * into v;
  return jsonb_build_object('id', v.id, 'token', v.token);
end
$$;

create function revoke_invite(p_invite uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_trip uuid;
begin
  select trip_id into v_trip from invites where id = p_invite;
  if v_trip is null or not is_organizer(v_trip) then
    raise exception 'only the organizer can revoke invites';
  end if;
  update invites set revoked_at = now() where id = p_invite and revoked_at is null;
end
$$;

-- Joining through a link makes the caller a pending member. Existing members, including removed
-- ones, keep their status: a removed member cannot get back in with the link.
create function redeem_invite(p_token text) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v invites;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  select * into v from invites where token = p_token and revoked_at is null and expires_at > now();
  if not found then
    raise exception 'invalid or expired invite';
  end if;
  insert into members (trip_id, user_id, role, status)
  values (v.trip_id, auth.uid(), 'member', 'pending')
  on conflict (trip_id, user_id) do nothing;
  select status into v_status from members where trip_id = v.trip_id and user_id = auth.uid();
  return jsonb_build_object('trip_id', v.trip_id, 'status', v_status);
end
$$;

create function approve_member(p_trip uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_organizer(p_trip) then
    raise exception 'only the organizer can approve members';
  end if;
  update members set status = 'approved'
  where trip_id = p_trip and user_id = p_user and status in ('pending', 'removed');
  if not found then
    raise exception 'member not found or already approved';
  end if;
end
$$;

create function remove_member(p_trip uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_organizer(p_trip) then
    raise exception 'only the organizer can remove members';
  end if;
  if exists (select 1 from members where trip_id = p_trip and user_id = p_user and role = 'organizer') then
    raise exception 'an organizer cannot be removed';
  end if;
  update members set status = 'removed' where trip_id = p_trip and user_id = p_user;
  if not found then
    raise exception 'member not found';
  end if;
end
$$;

revoke execute on function create_invite(uuid), revoke_invite(uuid), redeem_invite(text),
  approve_member(uuid, uuid), remove_member(uuid, uuid) from public;
grant execute on function create_invite(uuid), revoke_invite(uuid), redeem_invite(text),
  approve_member(uuid, uuid), remove_member(uuid, uuid) to authenticated;
