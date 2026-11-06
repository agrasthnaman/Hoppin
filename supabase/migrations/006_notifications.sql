-- Change notifications (issue #24). Every item write already lands in change_log; a job every 5 minutes (the
-- send-digest Edge Function) turns each trip's closed 5-minute window of changes into one digest per member: an
-- in-app record here, and an email for members who keep email on. Depends on 001 (trips, members, change_log) and
-- reads profiles (007) only when called.

alter table members add column email_digest boolean not null default true;

-- ---------------------------------------------------------------- what members read

create table notifications (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- the window the digest covers; with trip and person it makes recording the same batch twice a no-op
  window_start timestamptz not null,
  changes jsonb not null check (jsonb_typeof(changes) = 'array'),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (trip_id, user_id, window_start)
);
create index notifications_feed_idx on notifications (user_id, trip_id, created_at desc);
create index notifications_unread_idx on notifications (user_id, trip_id) where read_at is null;

alter table notifications enable row level security;
grant select on notifications to authenticated; -- written by record_digests, marked read by mark_notifications_read
create policy notifications_select on notifications for select to authenticated
  using (user_id = auth.uid() and is_approved_member(trip_id));

create function mark_notifications_read(p_trip uuid) returns void
language sql security definer set search_path = public
as $$
  update notifications set read_at = now()
  where trip_id = p_trip and user_id = auth.uid() and read_at is null
$$;

create function set_email_digest(p_trip uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public
as $$
begin
  update members set email_digest = p_on
  where trip_id = p_trip and user_id = auth.uid() and status = 'approved';
  if not found then
    raise exception 'only members of this trip can change this';
  end if;
end
$$;

-- ---------------------------------------------------------------- what the job reads

-- One row per trip: how far its log has been turned into digests, and when the oldest change not yet sent was made.
-- Kept up to date by a trigger, so the job finds waiting trips through a small index instead of scanning the log.
create table digest_queue (
  trip_id uuid primary key references trips (id) on delete cascade,
  through_id bigint not null default 0,
  pending_since timestamptz
);
create index digest_queue_ready_idx on digest_queue (pending_since) where pending_since is not null;
create index change_log_trip_id_idx on change_log (trip_id, id);

alter table digest_queue enable row level security;
revoke all on digest_queue from public, anon, authenticated;

-- History from before notifications existed is never sent.
insert into digest_queue (trip_id, through_id)
  select t.id, coalesce((select max(c.id) from change_log c where c.trip_id = t.id), 0) from trips t;

create function change_log_queue_digest() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into digest_queue (trip_id, pending_since) values (new.trip_id, new.changed_at)
  on conflict (trip_id) do update set pending_since = excluded.pending_since
    where digest_queue.pending_since is null; -- already waiting: leave the row alone
  return null;
end
$$;
create trigger change_log_queue_digest after insert on change_log
  for each row execute function change_log_queue_digest();

-- Trips whose oldest unsent change is older than the window (plus 30 seconds, so a write still committing is not
-- passed by), oldest first. For each: the unsent log entries in log order, and the approved members who may get a
-- digest. Email is left out for members who turned it off. The job decides the windows; see packages/core digest.ts.
create function claim_digest_batch(p_window_seconds integer, p_max_trips integer, p_max_entries integer) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'trip_id', q.trip_id,
      'trip_name', t.name,
      'through_id', q.through_id,
      'entries', (
        select coalesce(jsonb_agg(to_jsonb(e) order by e.id), '[]'::jsonb)
        from (
          select c.id, c.item_id, c.actor_id, c.op, c.changed_at, c.before, c.after, c.item_visibility, c.item_owner_id
          from change_log c
          where c.trip_id = q.trip_id and c.id > q.through_id
          order by c.id
          limit p_max_entries
        ) e
      ),
      'recipients', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'user_id', m.user_id,
          'email', case when m.email_digest then u.email end,
          'display_name', p.display_name
        )), '[]'::jsonb)
        from members m
        join auth.users u on u.id = m.user_id
        left join profiles p on p.user_id = m.user_id
        where m.trip_id = q.trip_id and m.status = 'approved'
      )
    ) order by q.pending_since)
    from (
      select dq.* from digest_queue dq
      where dq.pending_since is not null
        and dq.pending_since <= now() - make_interval(secs => p_window_seconds + 30)
      order by dq.pending_since
      limit p_max_trips
    ) q
    join trips t on t.id = q.trip_id
  ), '[]'::jsonb);
end
$$;

-- Records one trip's digests and moves the trip past them, in one step. Only if the trip is still where the batch
-- found it: a second run working on the same batch gets false and must not send anything. Rows for anyone who is not
-- an approved member are dropped. p_rows: [{ "user_id": uuid, "changes": [...] }].
create function record_digests(p_trip uuid, p_from_id bigint, p_through_id bigint, p_window_start timestamptz, p_rows jsonb)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if p_through_id < p_from_id then
    raise exception 'through_id must not go back';
  end if;
  update digest_queue
  set through_id = p_through_id,
      pending_since = (select min(c.changed_at) from change_log c where c.trip_id = p_trip and c.id > p_through_id)
  where trip_id = p_trip and through_id = p_from_id;
  if not found then
    return false;
  end if;
  insert into notifications (trip_id, user_id, window_start, changes)
    select p_trip, (r ->> 'user_id')::uuid, p_window_start, r -> 'changes'
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
    where jsonb_typeof(r -> 'changes') = 'array'
      and exists (select 1 from members m where m.trip_id = p_trip and m.user_id = (r ->> 'user_id')::uuid and m.status = 'approved')
  on conflict do nothing;
  return true;
end
$$;

revoke execute on function mark_notifications_read(uuid), set_email_digest(uuid, boolean), change_log_queue_digest(),
  claim_digest_batch(integer, integer, integer), record_digests(uuid, bigint, bigint, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function mark_notifications_read(uuid), set_email_digest(uuid, boolean) to authenticated;
grant execute on function claim_digest_batch(integer, integer, integer), record_digests(uuid, bigint, bigint, timestamptz, jsonb) to service_role;
