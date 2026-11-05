-- Schedules the hourly sign-up queue job. NOT a migration: pg_cron and pg_net are Supabase extensions, and the secret
-- must not live in the repository. Run this once in the Supabase SQL editor, after the Edge Function is deployed
-- (see docs/signup-queue.md), replacing the two placeholders below. Run it again to change the schedule.

-- 1. Turn on the two extensions (safe to repeat).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Keep the shared secret in Vault, not in the job text. Use the same value as the function secret DRAIN_SECRET.
--    (If you already stored one, update it instead:  select vault.update_secret(id, 'new value') ... )
-- select vault.create_secret('<the same value as DRAIN_SECRET>', 'drain_secret');

-- 3. Every hour, at 5 past, call the function. Replace <PROJECT_REF> with the project reference (the xxxx in
--    https://xxxx.supabase.co). The job sends the secret in the x-drain-secret header.
select cron.schedule(
  'drain-signup-queue',
  '5 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/drain-signup-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-drain-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'drain_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);

-- Check it is scheduled, and look at recent runs:
--   select jobid, jobname, schedule, active from cron.job where jobname = 'drain-signup-queue';
--   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;
--   select id, status_code, created from net._http_response order by created desc limit 10;

-- To stop it completely:
--   select cron.unschedule('drain-signup-queue');
