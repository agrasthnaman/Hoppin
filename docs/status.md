# Status and how to join in

Updated 2026-11-04. Read this first if you are new. Then see [CONTRIBUTING.md](../CONTRIBUTING.md), [work-plan.md](work-plan.md), [design-brief.md](design-brief.md), [deploy.md](deploy.md) and the [design](superpowers/specs/2026-11-03-tripapp-design.md).

## What works today
Run `npm run demo` to click through all of it on sample data. A signed-in person can: create an account (confirming their email once) and sign in with a password, reset a forgotten password, change their name, leave a trip, delete their account, create a trip (and become its organizer), make a co-organizer, delete a trip, join a trip from an invite link (and be approved or removed by the organizer), open their trips, see a day-by-day plan with group items and optional plans from friends, add plans, say "I'm in", open a booking, edit it, attach and open documents, record shared expenses in any currency (with guests, equal or exact splits) and see who pays whom in their own currency, and do all of this with no signal. Changes made offline are saved on the phone and sent when the connection returns; if two people changed the same thing, the later change wins, and the other is kept as a draft that can be applied again or discarded. Personal documents are stored encrypted on the phone, and a removed member's copy is wiped. The privacy rules are enforced in the database and verified against a real Supabase project.

## Issues
| Done | Issue |
|---|---|
| yes | #3 scaffold, #4 design system, #5 schema and privacy rules, #6 invites, #7 app shell, #9 trips list and create trip, #10 day view, #11 bookings and documents, #12 members screen, #13 offline cache, #14 offline edits and conflicts, #18 settlement, #19 currency, #20 expenses and Money screen (migration 005 not yet applied to dev), #37 data layer |
| partly | #1 accounts: dev project done, email service, prod project and hosting not done |
| open | everything else on the [issues page](https://github.com/agrasthnaman/Hoppin/issues) |

## Navigation
The bottom bar is **Days, Map, Money, Docs, More**. Map is a main tab because it is a key feature. There is no Today tab any more: Days opens on today's date during the trip, and its top card ("Happening now", "Up next", "Tonight you're at") is the old Today screen. `/trips/:id/today` still works and redirects to Days. "All trips" is in More.

## Look and feel
The app has a "soft pop" look with three palettes (Rose & teal, Lilac & lime, Tangerine & sky), each in light and dark, chosen in More > Appearance. **Read [design-brief.md](design-brief.md) before building any screen**: use only the semantic colour classes, and check your screen in all palettes and both modes in `npm run demo`.

## Where to start so nothing clashes
Work happens in "lanes" that touch different files. Claim an issue (assign yourself) before starting.

| Lane | Issues | Why it is safe |
|---|---|---|
| **Money** | Done: #18, #19, #20 | The Money screen, migration 005 and the money outbox are in. Follow-ups go in new issues. |
| Polls and weather | #21 polls (migration 002), #22 weather | New files; each adds one line to the route table. |
| Owner's lane (in progress, please avoid) | #15 Today view, then #38 bookings and My documents screens | These change the trip shell and the route table. |
| Waiting on accounts or keys | #8 images, #23 day map, #24 notifications, #28 deploy | Need keys from the owner (#2) or the email service (#1). |

## Files that cause merge conflicts (be careful)
- `apps/web/src/app/routes.tsx`: the route table. Add your one line at the end of the list and rebase often.
- `packages/core/src/types.ts` and `packages/core/src/index.ts`: only append. Do not reorder or rename existing exports.
- `supabase/migrations/`: **reserved numbers**: 002 polls, 003 share links, 004 images, 006 notifications, 014 and up free (005 expenses, 010 account, 011 arrival time zone, 012 polls and 013 trip destination are taken). Never edit a migration that is already applied (001, 007, 008, 009, 010): add a new one. Add a test in `supabase/test/` first.
- `apps/web/src/app/services.tsx` (the `Actions` list) and `apps/web/test/helpers.tsx` (the fake services): add at the end.

## Get set up
1. Node 22 or newer. `npm install` at the repo root. **If you are outside JFrog**: `package-lock.json` points at an internal registry, so `npm ci` will fail. Use `npm install --no-package-lock` and do not commit lockfile changes (a proper fix is pending).
2. `npm test` (all packages) and `npm run typecheck`. These need no accounts.
3. Fastest way to see it: `npm run demo` (sample data, nothing else needed). To run the app with real data: ask the owner for the dev project's URL and public key, then copy `apps/web/.env.example` to `apps/web/.env.local`. Without that, `npm run dev -w apps/web` and open `/gallery` to see the design system.
4. `npm run test:dev -w apps/web` runs against the real dev project and needs test users (see [deploy.md](deploy.md)); ask before running it.

## How we work
- Branch `issue-<number>-short-name`, one issue per pull request, `Closes #<number>`.
- **Tests first.** Write the failing test, see it fail, then write the code. Pure logic goes in `packages/core` (no browser code there). Privacy rules need database tests in `supabase/test/`.
- UI: follow the [design brief](design-brief.md); include phone-width screenshots.
- Never commit secrets. The Supabase anon key is public by design; the `service_role` key must never appear anywhere.
- Say plainly what you did not verify in the pull request description.

## Known gaps
- No timer-based refresh: the app refreshes on open, on reconnect, after each change and on request (issue filed).
- "Later change wins" compares the phone's clock with the server's, so a badly wrong phone clock can pick the wrong winner (notices and drafts make sure nothing is lost).
- Documents cannot be added offline (plans, edits, replies and money can).
- The iPhone offline check (#16) has not been done on a real phone.
- Email sending is limited until a custom email service is set up (#1).

## Weather and privacy
Each day shows a forecast for the trip's destination (set when creating the trip, or by an organizer under More). The place name you type is sent once to Open-Meteo's free search to get its coordinates, which are saved with the trip; after that only the coordinates and the date are sent to Open-Meteo for the forecast. No names, emails or trip details leave the app for the forecast. When you search for a place on a plan, the words you type, and the trip destination's coordinates when it has one, are sent to Photon (OpenStreetMap) to find a pin. A full map link is read on the device. A short maps.app.goo.gl link is opened so Google can turn it into the full address. Opening a map loads tiles from OpenFreeMap, so that service sees the connection. Tiles are not kept for offline use. Forecasts are kept on the device so the last one still shows offline ("Saved forecast, updated 14:05"); days more than 16 days ahead say "not available yet". A trip without a destination shows no weather. Migration `013_trip_destination.sql` adds the destination columns and must be applied before the app that sends them is deployed.
