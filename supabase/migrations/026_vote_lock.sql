-- Votes on one poll are cast one at a time. cast_vote replaces the person's earlier vote (delete, then insert), and two
-- calls at the same moment could each miss the other's new vote and both commit, leaving one person with a vote on
-- every option of a single-choice poll. Locking the poll row first makes the second call wait, then see the first
-- one's vote (and a poll closed meanwhile). FOR NO KEY UPDATE does not block the votes' own foreign-key checks.
-- Depends on 012.
create or replace function cast_vote(p_poll uuid, p_options uuid[]) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v polls;
  v_options uuid[];
begin
  select * into v from polls where id = p_poll for no key update;
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
