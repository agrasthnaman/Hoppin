-- A trip whose digest cannot be made is tried again later instead of on every run. The job takes the oldest waiting
-- trips first, a fixed number per run, and a trip that failed used to keep its place at the front: enough failing trips
-- (anyone can make trips) stopped notifications for every other trip. Now each failure pushes the trip back, 5 minutes
-- after the first and doubling up to once a day, and a success clears it. Depends on 006.

alter table digest_queue
  add column failures integer not null default 0,
  add column retry_at timestamptz;

create or replace function claim_digest_batch(p_window_seconds integer, p_max_trips integer, p_max_entries integer) returns jsonb
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
        and (dq.retry_at is null or dq.retry_at <= now())
      order by dq.pending_since
      limit p_max_trips
    ) q
    join trips t on t.id = q.trip_id
  ), '[]'::jsonb);
end
$$;

create or replace function record_digests(p_trip uuid, p_from_id bigint, p_through_id bigint, p_window_start timestamptz, p_rows jsonb)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if p_through_id < p_from_id then
    raise exception 'through_id must not go back';
  end if;
  update digest_queue
  set through_id = p_through_id,
      pending_since = (select min(c.changed_at) from change_log c where c.trip_id = p_trip and c.id > p_through_id),
      failures = 0,
      retry_at = null
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

-- The job could not make this trip's digest: try again later. Only if the trip is still where the batch found it, so a
-- run that lost a race never pushes back a trip another run already moved on. (The exponent is capped before it is
-- used, so the interval cannot overflow.)
create function defer_digest(p_trip uuid, p_from_id bigint) returns void
language sql security definer set search_path = public
as $$
  update digest_queue
  set failures = failures + 1,
      retry_at = now() + least(interval '5 minutes' * power(2, least(failures, 9)), interval '1 day')
  where trip_id = p_trip and through_id = p_from_id
$$;

revoke execute on function defer_digest(uuid, bigint) from public, anon, authenticated;
grant execute on function defer_digest(uuid, bigint) to service_role;
