-- Polls: a member asks the group a question with a few options, everyone votes, and the winner can become a plan.
-- Depends on 001 (is_approved_member, is_organizer).
--
-- Reading is plain row-level security: approved members of the trip only. Writing goes through functions, so a poll
-- and its options are created together, a vote replaces the person's earlier vote in one step, and the rules
-- (closed polls, single choice, options of this poll only) cannot be skipped by calling the tables directly.

create table polls (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  -- kept as null if the person deletes their account, so the poll stays for the group (organizers can still manage it)
  created_by uuid references auth.users (id) on delete set null,
  question text not null check (length(trim(question)) > 0 and length(question) <= 200),
  multiple boolean not null default false,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, trip_id)
);
create index polls_trip_idx on polls (trip_id, created_at);

create table poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null,
  trip_id uuid not null,
  label text not null check (length(trim(label)) > 0 and length(label) <= 100),
  position integer not null,
  unique (poll_id, position),
  foreign key (poll_id, trip_id) references polls (id, trip_id) on delete cascade,
  unique (id, poll_id)
);
create index poll_options_poll_idx on poll_options (poll_id, position);

create table poll_votes (
  poll_id uuid not null,
  option_id uuid not null,
  trip_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, option_id, user_id),
  foreign key (poll_id, trip_id) references polls (id, trip_id) on delete cascade,
  -- an option can only be voted for in its own poll
  foreign key (option_id, poll_id) references poll_options (id, poll_id) on delete cascade
);
create index poll_votes_user_idx on poll_votes (user_id);

alter table polls enable row level security;
alter table poll_options enable row level security;
alter table poll_votes enable row level security;

grant select, delete on polls to authenticated;   -- created and closed through functions
grant select on poll_options to authenticated;
grant select on poll_votes to authenticated;      -- cast through cast_vote()

create policy polls_select on polls for select to authenticated
  using (is_approved_member(trip_id));
-- the person who asked it, or an organizer, can delete it (options and votes go with it)
create policy polls_delete on polls for delete to authenticated
  using (is_approved_member(trip_id) and (created_by = auth.uid() or is_organizer(trip_id)));

create policy poll_options_select on poll_options for select to authenticated
  using (is_approved_member(trip_id));

-- Votes of people who have since left or been removed are not shown, so they stop counting.
create policy poll_votes_select on poll_votes for select to authenticated
  using (
    is_approved_member(trip_id)
    and exists (
      select 1 from members m
      where m.trip_id = poll_votes.trip_id and m.user_id = poll_votes.user_id and m.status = 'approved'
    )
  );

-- ---------------------------------------------------------------- functions

-- Creates a poll and its options (blank ones are skipped) in one step. Returns the poll's id.
create function create_poll(p_trip uuid, p_question text, p_multiple boolean, p_options text[]) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_poll uuid;
  v_labels text[];
  v_label text;
  v_position integer := 0;
begin
  if auth.uid() is null or not is_approved_member(p_trip) then
    raise exception 'only members of this trip can ask a question';
  end if;
  if p_question is null or length(trim(p_question)) = 0 then
    raise exception 'enter a question';
  end if;
  select coalesce(array_agg(trim(o) order by ord), '{}') into v_labels
    from unnest(coalesce(p_options, '{}')) with ordinality as t(o, ord)
    where length(trim(o)) > 0;
  if cardinality(v_labels) < 2 then
    raise exception 'add at least 2 options';
  end if;
  if cardinality(v_labels) > 10 then
    raise exception 'use at most 10 options';
  end if;
  if (select count(distinct lower(l)) from unnest(v_labels) as l) <> cardinality(v_labels) then
    raise exception 'each option must be different';
  end if;

  insert into polls (trip_id, created_by, question, multiple)
    values (p_trip, auth.uid(), trim(p_question), coalesce(p_multiple, false))
    returning id into v_poll;
  foreach v_label in array v_labels loop
    insert into poll_options (poll_id, trip_id, label, position) values (v_poll, p_trip, v_label, v_position);
    v_position := v_position + 1;
  end loop;
  return v_poll;
end
$$;

-- Sets the signed-in member's choice on a poll, replacing any earlier choice. An empty list withdraws it.
create function cast_vote(p_poll uuid, p_options uuid[]) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v polls;
  v_options uuid[];
begin
  select * into v from polls where id = p_poll;
  if not found or auth.uid() is null or not is_approved_member(v.trip_id) then
    raise exception 'poll not found';
  end if;
  if v.closed_at is not null then
    raise exception 'this poll is closed';
  end if;
  select coalesce(array_agg(distinct o), '{}') into v_options from unnest(coalesce(p_options, '{}')) as o;
  if not v.multiple and cardinality(v_options) > 1 then
    raise exception 'choose one option';
  end if;
  if exists (
    select 1 from unnest(v_options) as o
    where not exists (select 1 from poll_options po where po.id = o and po.poll_id = p_poll)
  ) then
    raise exception 'that option is not in this poll';
  end if;

  delete from poll_votes where poll_id = p_poll and user_id = auth.uid();
  insert into poll_votes (poll_id, option_id, trip_id, user_id)
    select p_poll, o, v.trip_id, auth.uid() from unnest(v_options) as o;
end
$$;

-- Stops a poll taking votes. The person who asked it, or an organizer, can do this.
create function close_poll(p_poll uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v polls;
begin
  select * into v from polls where id = p_poll;
  if not found or auth.uid() is null or not is_approved_member(v.trip_id)
     or not (v.created_by = auth.uid() or is_organizer(v.trip_id)) then
    raise exception 'only the person who asked or an organizer can close this poll';
  end if;
  update polls set closed_at = coalesce(closed_at, now()) where id = p_poll;
end
$$;

revoke execute on function create_poll(uuid, text, boolean, text[]), cast_vote(uuid, uuid[]), close_poll(uuid) from public;
grant execute on function create_poll(uuid, text, boolean, text[]), cast_vote(uuid, uuid[]), close_poll(uuid) to authenticated;
