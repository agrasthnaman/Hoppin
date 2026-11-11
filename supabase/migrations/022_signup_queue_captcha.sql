-- Joining the sign-up queue goes through the join-signup-queue Edge Function, which checks the Turnstile bot-check token
-- first. A queued email gets an invite from the hourly job, so letting the public key call join_signup_queue directly
-- let anyone fill the queue with other people's addresses and send them invites. Depends on 014 and 016.
revoke execute on function join_signup_queue(text, text) from anon, authenticated;
grant execute on function join_signup_queue(text, text) to service_role;
