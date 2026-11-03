-- Fix: deleting a trip failed. Deleting a trip deletes its items, and the item change-log trigger then tried to
-- log each deletion against a trip that was already gone (foreign key error). Only log when the trip still exists;
-- when the whole trip is being deleted, its history goes with it anyway.
create or replace function items_log_change() returns trigger
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
  elsif exists (select 1 from trips where id = old.trip_id) then
    insert into change_log (trip_id, item_id, actor_id, op, before, item_visibility, item_owner_id)
      values (old.trip_id, old.id, auth.uid(), 'delete', to_jsonb(old), old.visibility, old.owner_id);
  end if;
  return null;
end
$$;
