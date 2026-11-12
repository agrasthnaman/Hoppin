-- When someone leaves a trip or deletes their account, the history of their private plans in that trip goes too.
-- leave_trip and delete_my_account delete the private plans themselves, but every change to them stayed in change_log
-- as full before/after copies (only the owner could read them, yet "deleted" should mean deleted). Both end by deleting
-- the person's members row (account deletion through the cascade), so one trigger covers them. Depends on 001 and 010.
create function forget_private_history() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  delete from change_log
  where trip_id = old.trip_id and item_owner_id = old.user_id and item_visibility = 'private';
  return null;
end
$$;
create trigger on_member_deleted after delete on members
  for each row execute function forget_private_history();

-- History already left behind by people who are no longer in the trip.
delete from change_log c
where c.item_visibility = 'private'
  and not exists (select 1 from members m where m.trip_id = c.trip_id and m.user_id = c.item_owner_id);
