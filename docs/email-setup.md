# Email setup (so a whole group can sign in)

**Why:** Hoppin signs people in with an emailed link. Supabase's built-in sender is limited to **2 emails per hour** and, on the free plan, does not let you change the email design. So before real use you connect your own email service. This takes about 20 minutes, most of it waiting for DNS.

**Order matters:** 1) email provider, 2) branded templates. (Supabase refuses template changes until a custom provider is set.)

## Option A: Resend with your own domain (recommended)
1. **A domain you own.** Any registrar (about $10 to $15 a year). A subdomain of a domain you already own also works (for example `mail.yourname.com`). Sending from `noreply@yourdomain` looks trustworthy and reaches inboxes.
2. **Resend account** at resend.com (free to start; check their current free limits). Add your domain under Domains. Resend shows a few DNS records (usually one MX, and TXT records for SPF and DKIM). Paste them where your domain's DNS is managed. Verification takes a few minutes to a few hours.
3. **API key:** in Resend create an API key with "Sending access" for that domain. Copy it (it is shown once).
4. **Connect it to Supabase** (run on your machine; the key stays in your terminal and is never saved to a file):
   ```
   SUPABASE_ACCESS_TOKEN=<your supabase access token> SUPABASE_PROJECT_REF=xbcywfgodoweoqzqmufg \
   SMTP_HOST=smtp.resend.com SMTP_PORT=465 SMTP_USER=resend SMTP_PASS=<resend api key> \
   SENDER_EMAIL=noreply@yourdomain.com SENDER_NAME=Hoppin EMAILS_PER_HOUR=100 \
   node scripts/supabase-email.mjs smtp
   ```
5. **Apply the branded email design:**
   ```
   SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=xbcywfgodoweoqzqmufg node scripts/supabase-email.mjs templates
   ```
6. **Test:** on the app, "Create an account" with a friend's email and confirm the email arrives (check spam once). Then send a few more to be sure of the new rate limit.

## Option B: Gmail, for a first trip with friends (no domain needed)
1. On the Gmail account, turn on 2-step verification, then create an **App password** (Google Account > Security > App passwords).
2. Run step 4 above with `SMTP_HOST=smtp.gmail.com SMTP_PORT=465 SMTP_USER=<your gmail> SMTP_PASS=<app password> SENDER_EMAIL=<your gmail> SENDER_NAME=Hoppin`.
3. Emails come from your Gmail address, and Gmail limits how many you can send per day (a few hundred), which is plenty for a group. Move to Option A before opening the app to more people.

## Also needed before launch
- In Supabase, Authentication > URL configuration: set **Site URL** and add the real app address to **Redirect URLs** once the app is hosted (today only `localhost` addresses are allowed).
- Authentication > Rate limits: keep the "emails per hour" limit low enough to stop abuse and high enough for your group.
- Optional: add a **DMARC** record for your domain (Resend's docs explain how) so your emails are trusted.

## What is already prepared in this repo
- `supabase/email-templates/` has the branded confirm-signup and password-recovery emails (tested to be small, script-free and image-free, and to say the link works once and lasts 24 hours).
- People sign in with **email and password**. The email link only confirms the address when an account is created, and resets a forgotten password. Links are single-use and valid for 24 hours; passwords need at least 10 characters (and at most 72). Apply those settings with `node scripts/supabase-email.mjs auth` (needs `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF`). Keep "Confirm email" on.
- `scripts/supabase-email.mjs` applies the provider and templates.
