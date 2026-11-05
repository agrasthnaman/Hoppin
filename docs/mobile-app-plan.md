# Mobile apps (iOS and Android): plan

Status: planned, not started. Decided: one codebase, the current web app wrapped with Capacitor, shipped to the App Store and Google Play. Not decided yet: the four questions at the end.

## Approach
- The web app stays the product. Capacitor puts it in a native iOS and Android shell, so the screens, the offline sync and the tests carry over.
- The built app files are bundled inside the app (nothing is loaded from a URL), so it opens instantly and offline. Data still comes from Supabase.
- Native features are added where the web falls short: files, links, push, sharing.
- A rewrite (Swift/Kotlin or React Native) is not worth it: months of work and the existing app would be thrown away.

## Will the App Store accept it?
Apple's rule is guideline 4.2 (Minimum Functionality): an app must go beyond a repackaged website. The framework does not matter; Capacitor apps are approved routinely. Hoppin qualifies as a real app (accounts, shared data, offline sync, documents), and the native features below are what make the case. Plan: ship them in the first version, test with TestFlight first, give Apple a demo login, and explain the native features in the review notes. Account deletion is already built (required by Apple). "Sign in with Apple" is not needed because sign-in is email and password only.

## Phases (estimates, part-time)
| # | Phase | Result | Time |
|---|---|---|---|
| 0 | Accounts and decisions | Apple Developer ($99/yr), Google Play ($25 once), app name and ID, privacy policy page, Firebase project for push | 1-2 days of waiting |
| 1 | Shell running | App runs on both simulators and real phones; safe areas, status bar, splash screen, Android back button, keyboard; works offline in airplane mode; service worker disabled inside the native app | 2-3 days |
| 2 | Native essentials | Documents open in the system PDF viewer with Share / Save to Files; email and invite links open the app (iOS universal links, Android app links via `/.well-known` files on hoppinclub.com); sharing invites; haptics; the offline encryption key in secure storage | 1-2 weeks |
| 3 | Push notifications (issue #24) | New plan, change to today's plan, poll, expense, join request; per-trip mute; asks permission at a sensible moment (device token table with row-level security, edge function, APNs and FCM) | 1-2 weeks |
| 4 | Polish and QA | iPhone offline check (#16), real-device round, crash reporting, accessibility | about 1 week |
| 5 | Beta | TestFlight and Play internal testing with the Bali group | 1-2 weeks |
| 6 | Store launch | Listings, screenshots, privacy forms, review, staged rollout | about 1 week |
| 7 | Release routine | One scripted release for both stores | ongoing |

About 6-8 weeks end to end; most of the wall-clock time is accounts and store review.

## Risks
- Apple rejects thin wrappers: include the native features in version 1.
- Google: a new personal Play account needs a closed test with 12 testers for 14 days before it can publish. An organization account skips this.
- Android builds need Gradle, which the company package policy blocks on this machine. Build in Android Studio on a personal laptop or in GitHub Actions. iOS is not affected.
- Old app versions stay installed: keep database changes additive (as so far) and add a "please update" message for old versions.
- Store review takes 1-3 days on Apple and a few on Google.

## What only the owner can do
Create and pay for the developer accounts (they need a real identity), approve the app name and ID, the privacy policy wording and the screenshots.

## Decisions still open
1. Capacitor, one codebase for both stores: confirm.
2. Developer accounts: personal or organization.
3. App ID: `com.hoppinclub.app`? Hard to change later.
4. Push in the first beta or right after (recommended: in the first beta).
