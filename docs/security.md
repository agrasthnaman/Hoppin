# Security

Updated 2026-11-10. This is how Hoppin is protected, what was checked, and what is still open.

## "I can see the browser calling the database directly. Is that a problem?"
No. That is how Supabase is built. The app talks to Supabase's API with a **public key** (the "anon key"). It is meant to be in the browser; anyone can copy it. It proves nothing about who you are. What protects the data is:
1. **Row rules (row-level security) on every table.** Each row says who may read or change it. With only the public key, nothing can be read or written. This was tested against the live project: every table returns nothing, inserts are refused, the API's table list is hidden, storage is private.
2. **Your sign-in** (a short-lived token). A signed-in person can only reach rows their rules allow: their own trips, and only what the privacy rules show them.
3. **Functions** for anything that needs more than one step (create a trip, approve a member, expenses, polls). Each one checks who is calling.
4. **Time limits** on every request (3 seconds for the public key, 8 for signed-in people), so a heavy request cannot keep the database busy.
The key that can bypass all of this (the `service_role` key) is never in the app. It was searched for in the built files and the whole repository: not there.

## What protects what
| Risk | Protection |
|---|---|
| Reading someone else's trip, plans, documents | Row rules; private plans and personal documents hidden from other members (tests in `supabase/test/rls.test.ts`) |
| Writing where you should not | Row rules; direct writes only where a rule exists; everything else through checked functions |
| Using the public key to call functions | Migration 016 removes access to every function except the two sign-up queue ones |
| Files (tickets, passports) | Private bucket, per-person folders, the file's row rule decides who can open it; 25 MB limit enforced by the bucket |
| A planted link that runs code (`javascript:`) | The database only stores `http(s)` links (016) and the app only draws `http(s)` links (`safeWebUrl`) |
| Oversized data | Length and size limits in the database (016) |
| Someone embedding the app in another site (clickjacking) | `X-Frame-Options` and `frame-ancestors 'none'` in `apps/web/public/_headers` |
| Downgrade to http | `Strict-Transport-Security` |
| Leaked tokens or passwords | None in the repository, its history or the built app (checked). Real tokens live only in `.env.release` on the owner's Mac |
| Known-vulnerable packages | `npm audit --omit=dev`: 0 vulnerabilities (2026-11-10) |
| Guessing invite links | 128+ bits of randomness, expire after 24 hours, only organizers can read them |

## Still open (in order of importance)
1. **Rotate the credentials that were pasted into chat** (Supabase access token, database password, Cloudflare token, Resend key, GitHub token) and update `.env.release`. They allow full control of the project.
2. **Bot protection on sign-up** (Cloudflare Turnstile): sign-up sends emails and the email limit is shared by everyone, so a bot can use it up or fill the waiting list. Needs Turnstile keys, then turn on "CAPTCHA protection" in Supabase Auth.
3. **Content-Security-Policy**: the full policy is in `_headers` as report-only. Browse the app with the console open; when nothing is reported, make it enforced. (Tickets are read on the phone with a text-recognition library that downloads its language file from a public CDN: host it ourselves, then remove that CDN from the policy.)
4. **A separate test project.** Local development and the live site use the same Supabase project, so the live sign-in list allows `localhost` addresses. Create a second project for development, then remove `localhost` from the allowed redirect list.
5. **Account lookups:** the sign-up form says when an email already has an account, which lets someone check whether an address is registered. A deliberate friendliness trade-off; Turnstile limits abuse.
6. **Leaked-password check** (Supabase Pro) when the plan is upgraded.
7. Make the GitHub repository private (decision pending).

## How to check again
`npm test` (includes `supabase/test/rls.test.ts` and `hardening.test.ts`), `npm audit --omit=dev`, and the live probe: call the REST API with only the public key and confirm every table answers `[]`.
