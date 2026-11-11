-- When an account is deleted, its sign-up queue entry goes too. The entry used to stay ('invited' or 'skipped'), so
-- anyone could still learn the address once had an account, and the person could not sign up again through the app
-- (the form saw them as already in the queue). A trigger covers every way an account is deleted, including from the
-- Supabase dashboard. Depends on 014.

create function forget_signup_queue_entry() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  delete from signup_queue where lower(trim(email)) = lower(trim(old.email));
  return null;
end
$$;
create trigger on_auth_user_deleted after delete on auth.users
  for each row execute function forget_signup_queue_entry();

-- Entries left behind by accounts deleted before now. ('invited' and 'skipped' always had an account: the invite creates it.)
delete from signup_queue q
where q.status in ('invited', 'skipped')
  and not exists (select 1 from auth.users u where lower(u.email) = lower(trim(q.email)));
