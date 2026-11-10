-- Phone notification tokens (issue #130). A person can see and change only their own rows.
-- Deleting the account removes them: user_id references auth.users and cascades.
-- push_on is off until the person turns phone updates on for that trip.

create table push_tokens (
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null check (char_length(token) between 1 and 4096),
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, token)
);

alter table push_tokens enable row level security;
revoke all on push_tokens from public, anon;
grant select, insert, update, delete on push_tokens to authenticated;

create policy push_tokens_own on push_tokens for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table members add column push_on boolean not null default false;

create function set_push_updates(p_trip uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public
as $$
begin
  update members set push_on = p_on
  where trip_id = p_trip and user_id = auth.uid() and status = 'approved';
  if not found then
    raise exception 'only members of this trip can change this';
  end if;
end
$$;

-- Tokens for approved members of one trip who turned phone updates on. Only the notification job may call this.
create function push_targets(p_trip uuid) returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', t.user_id,
    'token', t.token,
    'platform', t.platform
  )), '[]'::jsonb)
  from push_tokens t
  join members m on m.user_id = t.user_id and m.trip_id = p_trip and m.status = 'approved' and m.push_on
$$;

revoke execute on function set_push_updates(uuid, boolean), push_targets(uuid) from public, anon, authenticated;
grant execute on function set_push_updates(uuid, boolean) to authenticated;
grant execute on function push_targets(uuid) to service_role;
