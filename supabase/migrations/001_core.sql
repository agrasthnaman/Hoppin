-- Hoppin core schema: trips, members, items, rsvps, documents, change_log.
-- Privacy is enforced here with row-level security, not in the app.
-- Assumes Supabase's auth schema (auth.users, auth.uid()).

-- ---------------------------------------------------------------- tables

create table trips (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  start_date date,
  end_date date,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table members (
  trip_id uuid not null references trips (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('organizer', 'member')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'removed')),
  can_edit_all boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);
create index members_user_idx on members (user_id);

create table items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  owner_id uuid not null references auth.users (id),
  kind text not null check (kind in ('flight', 'stay', 'activity', 'transport', 'plan')),
  visibility text not null check (visibility in ('private', 'shared')),
  group_item boolean not null default false,
  starts_at timestamptz not null,
  ends_at timestamptz,
  tz text not null,
  title text not null check (length(trim(title)) > 0),
  location_url text,
  details jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not group_item or visibility = 'shared'),
  check (ends_at is null or ends_at >= starts_at),
  unique (id, trip_id)
);
create index items_trip_start_idx on items (trip_id, starts_at);

create table rsvps (
  item_id uuid not null references items (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  item_id uuid,
  owner_id uuid not null references auth.users (id),
  scope text not null check (scope in ('shared', 'personal')),
  storage_path text not null,
  kind text not null,
  created_at timestamptz not null default now(),
  -- a document can only point at an item of the same trip; deleting the item keeps the document
  foreign key (item_id, trip_id) references items (id, trip_id) on delete set null (item_id)
);
create index documents_trip_idx on documents (trip_id);

create table change_log (
  id bigint generated always as identity primary key,
  trip_id uuid not null references trips (id) on delete cascade,
  item_id uuid, -- no foreign key: the history outlives a deleted item
  actor_id uuid,
  op text not null check (op in ('insert', 'update', 'delete')),
  changed_at timestamptz not null default now(),
  before jsonb,
  after jsonb,
  item_visibility text not null check (item_visibility in ('private', 'shared')),
  item_owner_id uuid
);
create index change_log_trip_idx on change_log (trip_id, changed_at);

-- ---------------------------------------------------------------- helpers
-- SECURITY DEFINER so policies can ask about membership without recursing into members' own policies.

create function is_approved_member(p_trip uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from members m
    where m.trip_id = p_trip and m.user_id = auth.uid() and m.status = 'approved'
  )
$$;

create function is_organizer(p_trip uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from members m
    where m.trip_id = p_trip and m.user_id = auth.uid() and m.status = 'approved' and m.role = 'organizer'
  )
$$;

-- Creator of the item, an organizer, or a member the organizer granted edit rights to.
create function can_edit_item(p_trip uuid, p_owner uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select auth.uid() = p_owner
      or exists (
        select 1 from members m
        where m.trip_id = p_trip and m.user_id = auth.uid() and m.status = 'approved'
          and (m.role = 'organizer' or m.can_edit_all)
      )
$$;

-- Creating a trip also makes the caller its approved organizer (users cannot insert trips directly).
create function create_trip(p_name text, p_start date default null, p_end date default null) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_trip uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  insert into trips (name, start_date, end_date, created_by)
    values (p_name, p_start, p_end, auth.uid())
    returning id into v_trip;
  insert into members (trip_id, user_id, role, status)
    values (v_trip, auth.uid(), 'organizer', 'approved');
  return v_trip;
end
$$;
revoke execute on function create_trip(text, date, date) from public;
grant execute on function create_trip(text, date, date) to authenticated;

-- ---------------------------------------------------------------- triggers

create function items_before_update() returns trigger
language plpgsql
as $$
begin
  if new.trip_id <> old.trip_id or new.owner_id <> old.owner_id then
    raise exception 'trip_id and owner_id of an item cannot change';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end
$$;
create trigger items_before_update before update on items
  for each row execute function items_before_update();

-- History of item changes. Entries about private content stay private: an update only counts as
-- shared if the item was shared both before and after it.
create function items_log_change() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into change_log (trip_id, item_id, actor_id, op, after, item_visibility, item_owner_id)
      values (new.trip_id, new.id, auth.uid(), 'insert', to_jsonb(new), new.visibility, new.owner_id);
  elsif tg_op = 'UPDATE' then
    insert into change_log (trip_id, item_id, actor_id, op, before, after, item_visibility, item_owner_id)
      values (new.trip_id, new.id, auth.uid(), 'update', to_jsonb(old), to_jsonb(new),
              case when old.visibility = 'shared' and new.visibility = 'shared' then 'shared' else 'private' end,
              new.owner_id);
  else
    insert into change_log (trip_id, item_id, actor_id, op, before, item_visibility, item_owner_id)
      values (old.trip_id, old.id, auth.uid(), 'delete', to_jsonb(old), old.visibility, old.owner_id);
  end if;
  return null;
end
$$;
create trigger items_log_change after insert or update or delete on items
  for each row execute function items_log_change();

-- ---------------------------------------------------------------- row-level security

alter table trips enable row level security;
alter table members enable row level security;
alter table items enable row level security;
alter table rsvps enable row level security;
alter table documents enable row level security;
alter table change_log enable row level security;

grant usage on schema public to authenticated;
grant select, update, delete on trips to authenticated;      -- inserts go through create_trip()
grant select, update on members to authenticated;            -- joining and removal go through invite functions (issue #6)
grant select, insert, update, delete on items to authenticated;
grant select, insert, delete on rsvps to authenticated;
grant select, insert, update, delete on documents to authenticated;
grant select on change_log to authenticated;                 -- written only by the trigger

-- trips
create policy trips_select on trips for select to authenticated
  using (is_approved_member(id));
create policy trips_update on trips for update to authenticated
  using (is_organizer(id)) with check (is_organizer(id));
create policy trips_delete on trips for delete to authenticated
  using (is_organizer(id));

-- members: approved members see everyone in their trip; anyone sees their own row (pending, removed).
create policy members_select on members for select to authenticated
  using (user_id = auth.uid() or is_approved_member(trip_id));
create policy members_update on members for update to authenticated
  using (is_organizer(trip_id)) with check (is_organizer(trip_id));

-- items: private items are visible to their owner only, even to the organizer.
create policy items_select on items for select to authenticated
  using (is_approved_member(trip_id) and (visibility = 'shared' or owner_id = auth.uid()));
create policy items_insert on items for insert to authenticated
  with check (is_approved_member(trip_id) and owner_id = auth.uid());
create policy items_update on items for update to authenticated
  using (
    is_approved_member(trip_id) and can_edit_item(trip_id, owner_id)
    and (visibility = 'shared' or owner_id = auth.uid())
  )
  with check (
    is_approved_member(trip_id) and can_edit_item(trip_id, owner_id)
    and (visibility = 'shared' or owner_id = auth.uid())
  );
create policy items_delete on items for delete to authenticated
  using (
    is_approved_member(trip_id) and can_edit_item(trip_id, owner_id)
    and (visibility = 'shared' or owner_id = auth.uid())
  );

-- rsvps: only on shared items you can see, only as yourself. Visible wherever the item is visible.
create policy rsvps_select on rsvps for select to authenticated
  using (exists (select 1 from items i where i.id = rsvps.item_id));
create policy rsvps_insert on rsvps for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from items i where i.id = rsvps.item_id and i.visibility = 'shared')
  );
create policy rsvps_delete on rsvps for delete to authenticated
  using (user_id = auth.uid());

-- documents: shared ones for all approved members; personal ones for the owner and the organizer.
create policy documents_select on documents for select to authenticated
  using (
    is_approved_member(trip_id)
    and (scope = 'shared' or owner_id = auth.uid() or is_organizer(trip_id))
  );
create policy documents_insert on documents for insert to authenticated
  with check (is_approved_member(trip_id) and owner_id = auth.uid());
create policy documents_update on documents for update to authenticated
  using (is_approved_member(trip_id) and (owner_id = auth.uid() or (scope = 'shared' and is_organizer(trip_id))))
  with check (is_approved_member(trip_id) and (owner_id = auth.uid() or (scope = 'shared' and is_organizer(trip_id))));
create policy documents_delete on documents for delete to authenticated
  using (is_approved_member(trip_id) and (owner_id = auth.uid() or (scope = 'shared' and is_organizer(trip_id))));

-- change_log: members read the history of shared items, and owners read the history of their own.
create policy change_log_select on change_log for select to authenticated
  using (is_approved_member(trip_id) and (item_visibility = 'shared' or item_owner_id = auth.uid()));
