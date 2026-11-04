-- Expenses: what people paid for the group, how each bill is split, and named guests (people without the app).
-- Amounts are whole minor units (paise, cents) in the currency paid. Each expense keeps the exchange rate to the
-- trip's counting currency captured when it was entered, so balances never move on their own.
-- Writes go through save_expense() and delete_expense() so a bill and its split always change together.
-- Depends on 001 only, so it works whether it runs before 007-010 (fresh database) or after them (projects that
-- already have those).

-- ---------------------------------------------------------------- tables

-- The one currency every bill is added up in. Set by the trip's first expense; fixed from then on.
alter table trips add column base_currency text check (base_currency ~ '^[A-Z]{3}$');

create table trip_guests (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  added_by uuid not null, -- no foreign key: a guest outlives the account that added them
  created_at timestamptz not null default now(),
  unique (id, trip_id)
);
create unique index trip_guests_name_idx on trip_guests (trip_id, lower(trim(name)));

create table expenses (
  id uuid primary key, -- chosen by the app, so an expense added offline keeps its id when it is sent
  trip_id uuid not null references trips (id) on delete cascade,
  kind text not null check (kind in ('expense', 'payment')),
  title text not null check (length(trim(title)) between 1 and 80),
  category text not null check (category in ('food', 'stay', 'transport', 'activity', 'shopping', 'other', 'payment')),
  -- no foreign key to accounts: an expense outlives a member who left or deleted their account
  paid_by_user uuid,
  paid_by_guest uuid,
  amount bigint not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  -- what one unit of `currency` was worth in `base_currency` on `rate_date`
  rate numeric not null check (rate > 0),
  rate_date date not null,
  base_currency text not null check (base_currency ~ '^[A-Z]{3}$'),
  spent_on date not null,
  created_by uuid not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((paid_by_user is null) <> (paid_by_guest is null)),
  check ((kind = 'payment') = (category = 'payment')),
  check (currency <> base_currency or rate = 1),
  unique (id, trip_id),
  -- checked at the end of the transaction, so deleting a whole trip (guests and expenses together) works
  foreign key (paid_by_guest, trip_id) references trip_guests (id, trip_id) deferrable initially deferred
);
create index expenses_trip_idx on expenses (trip_id, spent_on);

-- One row per person in the split, in the order they were listed (the order decides who gets a leftover paisa).
-- `share` is that person's exact part in minor units of the expense's currency; null on everyone means equal parts.
create table expense_shares (
  expense_id uuid not null,
  trip_id uuid not null,
  position smallint not null check (position >= 0),
  user_id uuid,
  guest_id uuid,
  share bigint check (share is null or share >= 0),
  primary key (expense_id, position),
  check ((user_id is null) <> (guest_id is null)),
  foreign key (expense_id, trip_id) references expenses (id, trip_id) on delete cascade,
  foreign key (guest_id, trip_id) references trip_guests (id, trip_id) deferrable initially deferred
);
create index expense_shares_trip_idx on expense_shares (trip_id);

-- History of expenses lives next to the history of items. Entries about an expense have no item.
alter table change_log add column expense_id uuid; -- no foreign key: the history outlives a deleted expense
create index change_log_expense_idx on change_log (expense_id) where expense_id is not null;

-- ---------------------------------------------------------------- the counting currency cannot change

create function trips_keep_base_currency() returns trigger
language plpgsql
as $$
begin
  if old.base_currency is not null and new.base_currency is distinct from old.base_currency then
    raise exception 'the trip''s counting currency cannot change once expenses use it';
  end if;
  return new;
end
$$;
create trigger trips_keep_base_currency before update of base_currency on trips
  for each row execute function trips_keep_base_currency();

-- ---------------------------------------------------------------- writing

-- An expense with its split, as stored in the history.
create function expense_snapshot(p_id uuid) returns jsonb
language sql stable set search_path = public
as $$
  select to_jsonb(e) - 'version' - 'created_at' - 'updated_at'
    || jsonb_build_object('shares', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', s.user_id, 'guest_id', s.guest_id, 'share', s.share) order by s.position)
      from expense_shares s where s.expense_id = e.id
    ), '[]'::jsonb))
  from expenses e where e.id = p_id
$$;
revoke execute on function expense_snapshot(uuid) from public;

-- Adds an expense or a payment, or changes one the caller added. Sending the same thing twice is harmless.
-- `p`: id, trip_id, kind, title, category, paid_by_user | paid_by_guest, amount, currency, rate, rate_date,
-- base_currency (the counting currency the rate is to), spent_on, shares: [{ user_id | guest_id, share? }].
create function save_expense(p jsonb) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_id uuid := (p ->> 'id')::uuid;
  v_trip uuid := (p ->> 'trip_id')::uuid;
  v_kind text := coalesce(p ->> 'kind', 'expense');
  v_payer_user uuid := (p ->> 'paid_by_user')::uuid;
  v_payer_guest uuid := (p ->> 'paid_by_guest')::uuid;
  v_amount bigint := (p ->> 'amount')::bigint;
  v_currency text := p ->> 'currency';
  v_shares jsonb := coalesce(p -> 'shares', '[]'::jsonb);
  v_base text;
  v_old expenses;
  v_known uuid[] := '{}';
  v_before jsonb;
  v_after jsonb;
  v_count int;
  v_custom int;
  v_sum numeric;
  v_receiver_user uuid;
  v_receiver_guest uuid;
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  if v_id is null or v_trip is null then
    raise exception 'an expense needs an id and a trip';
  end if;
  if not is_approved_member(v_trip) then
    raise exception 'only approved members of the trip can add expenses';
  end if;

  select * into v_old from expenses where id = v_id for update;
  if found then
    if v_old.trip_id <> v_trip then
      raise exception 'this expense belongs to another trip';
    end if;
    if v_old.created_by <> me then
      raise exception 'only the person who added this can change it';
    end if;
    if v_old.kind <> v_kind then
      raise exception 'an expense cannot turn into a payment, or back';
    end if;
    -- people already on it may stay on it, even if they have since left the trip
    v_known := array_remove(array(select user_id from expense_shares where expense_id = v_id) || v_old.paid_by_user, null);
    v_before := expense_snapshot(v_id);
  end if;

  -- the counting currency: the first expense sets it, every later one must use it
  select base_currency into v_base from trips where id = v_trip for update;
  if v_base is null then
    v_base := p ->> 'base_currency';
    if v_base is null or v_base !~ '^[A-Z]{3}$' then
      raise exception 'say which currency the trip counts in';
    end if;
    update trips set base_currency = v_base where id = v_trip;
  elsif v_base is distinct from p ->> 'base_currency' then
    raise exception 'base_currency:%', v_base;
  end if;

  -- who paid
  if (v_payer_user is null) = (v_payer_guest is null) then
    raise exception 'say who paid: one member or one guest';
  end if;
  if v_payer_user is not null and v_payer_user <> all (v_known) and not exists (
    select 1 from members where trip_id = v_trip and user_id = v_payer_user and status = 'approved'
  ) then
    raise exception 'whoever paid must be in the trip';
  end if;

  -- the split
  if jsonb_typeof(v_shares) <> 'array' or jsonb_array_length(v_shares) = 0 then
    raise exception 'the split has nobody in it';
  end if;
  if jsonb_array_length(v_shares) > 100 then
    raise exception 'a split can have at most 100 people';
  end if;
  select count(*),
         count(*) filter (where x ->> 'share' is not null),
         coalesce(sum((x ->> 'share')::numeric), 0)
    into v_count, v_custom, v_sum
    from jsonb_array_elements(v_shares) x;
  if exists (select 1 from jsonb_array_elements(v_shares) x where (x ->> 'user_id' is null) = (x ->> 'guest_id' is null)) then
    raise exception 'each person in the split is one member or one guest';
  end if;
  if (select count(distinct coalesce(x ->> 'user_id', x ->> 'guest_id')) from jsonb_array_elements(v_shares) x) <> v_count then
    raise exception 'someone is in the split twice';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_shares) x
    where x ->> 'user_id' is not null
      and (x ->> 'user_id')::uuid <> all (v_known)
      and not exists (select 1 from members m where m.trip_id = v_trip and m.user_id = (x ->> 'user_id')::uuid and m.status = 'approved')
  ) then
    raise exception 'everyone in the split must be in the trip';
  end if;
  if v_custom > 0 and v_custom <> v_count then
    raise exception 'give a share for everyone in the split, or for nobody';
  end if;
  if v_custom > 0 and v_sum <> v_amount then
    raise exception 'the shares must add up to the amount';
  end if;
  if exists (select 1 from jsonb_array_elements(v_shares) x where (x ->> 'share')::numeric < 0) then
    raise exception 'a share cannot be below zero';
  end if;
  if v_custom > 0 and v_sum = 0 then
    raise exception 'at least one share must be more than zero';
  end if;

  -- a payment: someone paid one person back, recorded by the person who got the money
  if v_kind = 'payment' then
    if v_count <> 1 or v_custom > 0 then
      raise exception 'a payment goes to exactly one person';
    end if;
    if v_currency is distinct from v_base then
      raise exception 'a payment is recorded in the trip''s counting currency';
    end if;
    v_receiver_user := (v_shares -> 0 ->> 'user_id')::uuid;
    v_receiver_guest := (v_shares -> 0 ->> 'guest_id')::uuid;
    if coalesce(v_receiver_user, v_receiver_guest) = coalesce(v_payer_user, v_payer_guest) then
      raise exception 'someone cannot pay themselves';
    end if;
    if not (coalesce(v_receiver_user = me, false) or exists (
      select 1 from trip_guests g where g.id = v_receiver_guest and g.trip_id = v_trip and g.added_by = me
    )) then
      raise exception 'only the person who gets the money can mark it as paid';
    end if;
  end if;

  if v_old.id is null then
    insert into expenses (id, trip_id, kind, title, category, paid_by_user, paid_by_guest, amount, currency, rate,
                          rate_date, base_currency, spent_on, created_by)
    values (v_id, v_trip, v_kind,
            case when v_kind = 'payment' then 'Paid back' else trim(p ->> 'title') end,
            case when v_kind = 'payment' then 'payment' else coalesce(p ->> 'category', 'other') end,
            v_payer_user, v_payer_guest, v_amount, v_currency, (p ->> 'rate')::numeric,
            (p ->> 'rate_date')::date, v_base, (p ->> 'spent_on')::date, me);
  else
    update expenses set
      title = case when v_kind = 'payment' then 'Paid back' else trim(p ->> 'title') end,
      category = case when v_kind = 'payment' then 'payment' else coalesce(p ->> 'category', 'other') end,
      paid_by_user = v_payer_user,
      paid_by_guest = v_payer_guest,
      amount = v_amount,
      currency = v_currency,
      rate = (p ->> 'rate')::numeric,
      rate_date = (p ->> 'rate_date')::date,
      base_currency = v_base,
      spent_on = (p ->> 'spent_on')::date,
      version = version + 1,
      updated_at = now()
    where id = v_id;
    delete from expense_shares where expense_id = v_id;
  end if;

  insert into expense_shares (expense_id, trip_id, position, user_id, guest_id, share)
  select v_id, v_trip, (t.ord - 1)::smallint, (t.x ->> 'user_id')::uuid, (t.x ->> 'guest_id')::uuid, (t.x ->> 'share')::bigint
  from jsonb_array_elements(v_shares) with ordinality as t(x, ord);

  v_after := expense_snapshot(v_id);
  if v_before is not null and v_before = v_after then
    -- nothing changed (the same change sent again): keep the version and leave no history entry
    update expenses set version = v_old.version, updated_at = v_old.updated_at where id = v_id;
  else
    insert into change_log (trip_id, item_id, expense_id, actor_id, op, before, after, item_visibility, item_owner_id)
    values (v_trip, null, v_id, me, case when v_before is null then 'insert' else 'update' end, v_before, v_after, 'shared', me);
  end if;

  return v_after || jsonb_build_object('version', (select version from expenses where id = v_id));
end
$$;

-- Deletes an expense or payment the caller added. Deleting one that is already gone is harmless.
create function delete_expense(p_id uuid) returns void
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  v_old expenses;
  v_before jsonb;
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  select * into v_old from expenses where id = p_id for update;
  if not found then
    return;
  end if;
  if v_old.created_by <> me or not is_approved_member(v_old.trip_id) then
    raise exception 'only the person who added this can delete it';
  end if;
  v_before := expense_snapshot(p_id);
  delete from expenses where id = p_id;
  insert into change_log (trip_id, item_id, expense_id, actor_id, op, before, item_visibility, item_owner_id)
  values (v_old.trip_id, null, p_id, me, 'delete', v_before, 'shared', me);
end
$$;

revoke execute on function save_expense(jsonb), delete_expense(uuid) from public;
grant execute on function save_expense(jsonb), delete_expense(uuid) to authenticated;

-- ---------------------------------------------------------------- row-level security

alter table trip_guests enable row level security;
alter table expenses enable row level security;
alter table expense_shares enable row level security;

grant select on trip_guests, expenses, expense_shares to authenticated;
grant insert (id, trip_id, name, added_by) on trip_guests to authenticated;

create policy trip_guests_select on trip_guests for select to authenticated
  using (is_approved_member(trip_id));
create policy trip_guests_insert on trip_guests for insert to authenticated
  with check (is_approved_member(trip_id) and added_by = auth.uid());
create policy expenses_select on expenses for select to authenticated
  using (is_approved_member(trip_id));
create policy expense_shares_select on expense_shares for select to authenticated
  using (is_approved_member(trip_id));
