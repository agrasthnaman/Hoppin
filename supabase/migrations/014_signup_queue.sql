-- Overflow queue for sign-ups. Normal sign-up is unchanged. Only when the email service says it is over its limit
-- does the app save the person's email here, and an hourly job (the drain-signup-queue Edge Function) then sends
-- each of them an invite link, oldest first. Passwords are never stored here: only the email and a display name.
-- Depends on nothing but auth.users (to tell whether an email already has an account).

create table signup_queue (
  id uuid primary key default gen_random_uuid(),
  email text not null check (length(email) between 3 and 254),
  display_name text check (display_name is null or length(display_name) <= 80),
  status text not null default 'waiting' check (status in ('waiting', 'invited', 'skipped')),
  created_at timestamptz not null default now(),
  invited_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  -- set while a drain run is working on the row, so two overlapping runs never invite the same person twice
  claimed_at timestamptz
);
create unique index signup_queue_email_idx on signup_queue (lower(trim(email)));
create index signup_queue_waiting_idx on signup_queue (created_at, id) where status = 'waiting';

-- One row of settings, changeable with a single UPDATE (no deploy).
create table signup_queue_settings (
  only_row boolean primary key default true check (only_row),
  batch_size integer not null default 10 check (batch_size between 1 and 100),
  paused boolean not null default false,
  max_waiting integer not null default 2000 check (max_waiting >= 0)
);
insert into signup_queue_settings default values;

-- Nobody reaches these tables directly. Row-level security is on with no policies, and the grants are removed too.
alter table signup_queue enable row level security;
alter table signup_queue_settings enable row level security;
revoke all on signup_queue, signup_queue_settings from public, anon, authenticated;

-- ---------------------------------------------------------------- what the app calls (before sign-up)

-- Where does this email stand? none | waiting | invited | registered
create function signup_queue_status(p_email text) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_status text;
begin
  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    return jsonb_build_object('status', 'registered');
  end if;
  select q.status into v_status from signup_queue q where lower(trim(q.email)) = v_email;
  if v_status is null then
    return jsonb_build_object('status', 'none');
  end if;
  return jsonb_build_object('status', case when v_status = 'skipped' then 'registered' else v_status end);
end
$$;

-- Saves a spot. Safe to call again and again: the second call just says the person is already queued.
-- queued | already_queued | registered | full
create function join_signup_queue(p_email text, p_name text default null) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_name text := nullif(left(trim(coalesce(p_name, '')), 80), '');
  v_inserted uuid;
begin
  if length(v_email) > 254 or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'enter a valid email';
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    return jsonb_build_object('status', 'registered');
  end if;
  if exists (select 1 from signup_queue q where lower(trim(q.email)) = v_email) then
    return jsonb_build_object('status', 'already_queued');
  end if;
  if (select count(*) from signup_queue where status = 'waiting') >= (select max_waiting from signup_queue_settings) then
    return jsonb_build_object('status', 'full');
  end if;
  insert into signup_queue (email, display_name) values (v_email, v_name)
  on conflict do nothing
  returning id into v_inserted;
  return jsonb_build_object('status', case when v_inserted is null then 'already_queued' else 'queued' end);
end
$$;

-- ---------------------------------------------------------------- what the hourly job calls (service role only)

-- Takes up to batch_size of the oldest waiting people and marks them as being worked on for 15 minutes. Gives back
-- nothing while paused or when the queue is empty. A person taken here is not given to another run until they are
-- marked, released, or the 15 minutes pass (a run that crashed).
create function claim_signup_queue() returns table (id uuid, email text, display_name text)
language plpgsql security definer set search_path = public
as $$
declare
  v_batch integer;
  v_paused boolean;
begin
  select s.batch_size, s.paused into v_batch, v_paused from signup_queue_settings s;
  if v_paused then
    return;
  end if;
  return query
    with picked as (
      select q.id from signup_queue q
      where q.status = 'waiting' and (q.claimed_at is null or q.claimed_at < now() - interval '15 minutes')
      order by q.created_at, q.id
      limit v_batch
      for update skip locked
    )
    update signup_queue s
    set attempts = s.attempts + 1, claimed_at = now()
    from picked
    where s.id = picked.id
    returning s.id, s.email, s.display_name;
end
$$;

-- Records what happened to one claimed person.
--   'invited' / 'skipped': done (skipped = they already had an account).
--   'waiting' with an error: leave them in the queue for the next run, remember why.
--   'waiting' with no error: give the claim back untouched (the email service said stop), and do not count the try.
create function mark_signup_queue(p_id uuid, p_status text, p_error text default null) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_status not in ('invited', 'skipped', 'waiting') then
    raise exception 'unknown status';
  end if;
  update signup_queue
  set status = p_status,
      invited_at = case when p_status = 'invited' then now() else invited_at end,
      last_error = left(p_error, 300),
      claimed_at = null,
      attempts = case when p_status = 'waiting' and p_error is null then greatest(attempts - 1, 0) else attempts end
  where id = p_id;
end
$$;

revoke execute on function signup_queue_status(text), join_signup_queue(text, text), claim_signup_queue(),
  mark_signup_queue(uuid, text, text) from public, anon, authenticated;
grant execute on function signup_queue_status(text), join_signup_queue(text, text) to anon, authenticated;
grant execute on function claim_signup_queue(), mark_signup_queue(uuid, text, text) to service_role;
