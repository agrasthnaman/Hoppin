# Turnstile (bot check on sign-in)

Cloudflare Turnstile checks that a visitor is a person, mostly invisibly. The app shows it on sign-in, sign-up and the password-reset forms.

- **Site key** (public): `VITE_TURNSTILE_SITE_KEY` in `apps/web/.env.local` (used at build time) and listed in `.env.release` as `TURNSTILE_SITE_KEY`. Empty means the check is off (tests, the demo).
- **Secret key** (private): `TURNSTILE_SECRET_KEY` in `.env.release` only. It is also stored in Supabase Auth, which verifies each token.
- The widget's allowed hostnames (Cloudflare dashboard > Turnstile) must include `hoppinclub.com`. To sign in from a local copy of the app, also add `localhost` (the local app uses the same live project).
- The Android shell is `https://localhost`, so `localhost` covers it. The iOS shell is `capacitor://localhost`. Turnstile's hostname list is a DNS name, and it may refuse that scheme. Do not turn the check off for the website to work around this. If a build on an iPhone shows the widget failing, the owner adds whatever hostname Cloudflare will accept, or we revisit `server.hostname` in `capacitor.config.ts` (left as the default `localhost` on purpose). This was not verified on a device from this change.

## Turning it on (in this order, or everyone is locked out)
1. Release the app version that sends the token (it is harmless while Supabase's check is still off).
2. Turn on Supabase's check: Management API `PATCH /v1/projects/<ref>/config/auth` with `security_captcha_enabled: true`, `security_captcha_provider: "turnstile"`, `security_captcha_secret: <secret>`.
3. Try signing in, creating an account and resetting a password once.

## Turning it off in an emergency
Set `security_captcha_enabled: false` with the same call. The app keeps working (the token is then ignored).
