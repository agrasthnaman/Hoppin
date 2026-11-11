# Sign-up queue (when the email limit is reached)

Sign-up works as normal. Only when the email service says it is over its limit does the app offer to save the person's
email in a queue ("Save my spot"), and then show "You're in the queue". Once an hour a job sends each waiting person an invite link, oldest first. The
invite works once and lasts 24 hours; opening it signs the person in and asks them to create a password.

Passwords are never saved in the queue: only the email and the display name.

## How it fits together
- **Database** (`supabase/migrations/014_signup_queue.sql`): `signup_queue` (the people), `signup_queue_settings` (one row:
  `batch_size`, `paused`, `max_waiting`), and four functions. Nobody can read or change the tables directly.
  - `signup_queue_status(email)`: what the sign-up form calls first (anyone may ask).
  - `join_signup_queue(email, name)`: saves a spot. Joining twice is harmless and answers "already queued". Only the
    service role may call it, through the front-door function below, so the public key cannot fill the queue with
    other people's addresses.
  - `claim_signup_queue()` and `mark_signup_queue(...)`: only the job (service role) can call these. A claimed person is
    not handed to another run for 15 minutes, so two overlapping runs never invite the same person twice.
- **Front door** (`supabase/functions/join-signup-queue`): when sign-up hits the email limit, the form offers "Save my
  spot". That sends the email, name and a fresh Turnstile bot-check token here; the function checks the token with
  Cloudflare and only then calls `join_signup_queue`. Without `TURNSTILE_SECRET_KEY` it refuses everyone, so the queue
  needs Turnstile turned on (docs/turnstile.md).
- **Job** (`supabase/functions/drain-signup-queue`): takes a batch, sends invites with `auth.admin.inviteUserByEmail`, records
  the result. If the email service says it is over its limit, it stops at once and leaves everyone it had not invited
  waiting. It sends nothing when the queue is empty or paused. It never logs email addresses.
- **Schedule** (`supabase/ops/schedule-drain.sql`): pg_cron calls the function once an hour.
- **Email** (`supabase/email-templates/invite.html`): the invite email, applied with `scripts/supabase-email.mjs templates`.

## Turning it on (in this order)
1. **Apply the migration**: paste `supabase/migrations/014_signup_queue.sql` into the Supabase SQL editor (or send it
   through the Management API `database/query` endpoint). It only adds tables and functions.
2. **Apply the invite email template** (and, with it, the two that already exist):
   `SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... node scripts/supabase-email.mjs templates`
3. **Deploy the app** (the sign-up form now uses the queue and the invite link goes to "Create your password"). Do this
   after steps 1 and 2: the form calls the new database functions.
4. **Deploy the functions** with the Supabase CLI (`supabase login`, then from the repo root), or run the release with
   `--functions`:
   `supabase functions deploy drain-signup-queue --no-verify-jwt --project-ref <PROJECT_REF>`
   `supabase functions deploy join-signup-queue --no-verify-jwt --project-ref <PROJECT_REF>`
   (`--no-verify-jwt`: the drain is called by the database itself, which proves who it is with the shared secret, and
   the front door is called by people who are not signed in yet, who prove they are people with the bot check.)
5. **Set the function secrets** (they live only in Supabase, never in the repo or the browser):
   `supabase secrets set DRAIN_SECRET=<a long random value> SITE_URL=https://hoppinclub.com TURNSTILE_SECRET_KEY=<the Turnstile secret> --project-ref <PROJECT_REF>`
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to every function automatically.
6. **Schedule it**: open `supabase/ops/schedule-drain.sql`, put the same secret value into the Vault line and the
   project reference into the URL, and run it in the SQL editor.
7. **Try it once**: add a test email to the queue with the SQL below, then send a batch now (also below) and check the
   email arrives and the link works once.

## Everyday SQL (Supabase SQL editor)
```sql
-- How big is the queue?
select status, count(*) from signup_queue group by status order by status;

-- Who is next (without the full list of emails on screen, show counts per day instead)
select created_at::date as day, count(*) from signup_queue where status = 'waiting' group by 1 order by 1;

-- Pause / resume (the hourly job then sends nothing / carries on)
update signup_queue_settings set paused = true;
update signup_queue_settings set paused = false;

-- Change how many people are invited per run (1 to 100). Keep it below the email limit per hour, and leave room for
-- password resets: with a 30 per hour limit, 10 to 20 is comfortable.
update signup_queue_settings set batch_size = 15;

-- Change the most people allowed to wait at once
update signup_queue_settings set max_waiting = 2000;

-- Send a batch now, without waiting for the hour (use the same secret as DRAIN_SECRET)
select net.http_post(
  url := 'https://<PROJECT_REF>.supabase.co/functions/v1/drain-signup-queue',
  headers := jsonb_build_object('Content-Type', 'application/json',
    'x-drain-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'drain_secret')),
  body := '{}'::jsonb);

-- Move someone to the front
update signup_queue set created_at = (select min(created_at) - interval '1 second' from signup_queue where status = 'waiting')
where lower(email) = lower('person@example.com') and status = 'waiting';

-- Remove an email from the queue
delete from signup_queue where lower(email) = lower('person@example.com');

-- Put someone who was marked skipped or invited back in line
update signup_queue set status = 'waiting', claimed_at = null where lower(email) = lower('person@example.com');

-- See why a person is still waiting after several tries
select attempts, last_error from signup_queue where lower(email) = lower('person@example.com');
```

## Good to know
- **What people see.** The sign-up form checks the queue first. Someone already waiting sees "You're already in the queue"
  and no second request is made. Someone who already has an account sees "You already have an account".
- **When the queue is full** (`max_waiting`) people see a calm "We're at capacity right now, please try again tomorrow".
- **Email limits to keep in mind.** Supabase's setting (`rate_limit_email_sent`, now 30 an hour) and the Resend plan's own
  daily cap (check the dashboard) both apply. Invites share them with password resets and confirmation emails.
- **Expired invites.** An invite lasts 24 hours. If it goes unused, the person can sign up again, or sign in and ask for a
  fresh link. They stay in the table as `invited` and are not invited again automatically.
- **Removing a person's data.** `delete from signup_queue where lower(email) = lower('...')`. The table holds nothing else
  about them. Deleting an account removes its entry automatically (a trigger on `auth.users`).
