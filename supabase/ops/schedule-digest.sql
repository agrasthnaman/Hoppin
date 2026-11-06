-- Schedules the 5-minute notification job. NOT a migration: pg_cron and pg_net are Supabase extensions, and the
-- secret must not live in the repository. Run this once in the Supabase SQL editor after migration 006 is applied and
-- the Edge Function is deployed:
--   supabase secrets set DIGEST_SECRET=<random> RESEND_API_KEY=<key> DIGEST_FROM="Hoppin <updates@hoppinclub.com>"
--   supabase functions deploy send-digest --no-verify-jwt --project-ref <PROJECT_REF>
-- then replace the placeholders below. Run it again to change the schedule.

-- 1. Turn on the two extensions (safe to repeat).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Keep the shared secret in Vault, not in the job text. Use the same value as the function secret DIGEST_SECRET.
-- select vault.create_secret('<the same value as DIGEST_SECRET>', 'digest_secret');

-- 3. Every 5 minutes, call the function. Replace <PROJECT_REF> with the project reference.
select cron.schedule(
  'send-digest',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-digest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'digest_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Check it:   select jobid, jobname, schedule, active from cron.job where jobname = 'send-digest';
-- Stop it:    select cron.unschedule('send-digest');
