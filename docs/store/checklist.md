# Pre-submission checklist

Tick an item only when it is true of the build you are about to send. Items that are true in this repository are ticked. Items that need a phone, a store account, or a deploy are open.

## In this repository

- [x] Bundle id is `club.hoppinclub.app` on iOS and Android.
- [x] v1 is iPhone only (`TARGETED_DEVICE_FAMILY = 1`).
- [x] Marketing version matches `apps/web/package.json` (`1.0.0`) on iOS and Android. Build number is `1` in both.
- [x] No signing secret, Firebase file, or service-account JSON is committed. `google-services.json` and `GoogleService-Info.plist` are gitignored.
- [x] Sign-in is email and password only. Sign in with Apple is not required. See `questionnaires.md`.
- [x] Privacy and terms pages exist at `/privacy` and `/terms`, and they describe the push token, what deletion removes, and what it leaves.
- [x] Account deletion is Account, then Delete my account. A push token is removed with the account. Signing out removes this phone's token.
- [x] Phone notification permission is asked only after the person has a trip and taps Turn on, or turns the Updates switch on. It is not asked on first launch.
- [x] Calendar is the existing calendar file through the share sheet. No calendar permission.
- [x] Poster photos use the system file picker. No photo-library usage string.
- [x] The app does not ask for the camera, the microphone, location, or payment.
- [x] Store listing text names no other platform, no competitor, and no price. See `listing.md`.
- [x] Review notes are in `review-notes.md`. Questionnaires are in `questionnaires.md`.

## Before you upload

- [ ] `grep -ri "upgrade\|premium\|subscribe\|price" apps/web/src packages/core/src` shows no payment offer. Re-run it on the commit you ship. A passing run on an earlier tree is not this box.
- [ ] Privacy URL https://hoppinclub.com/privacy returns the privacy page (it is local until that deploy).
- [ ] `TEAMID` in the Apple app site association file is the real Team ID, and the file is deployed.
- [ ] `assetlinks.json` has the debug, upload, and Play signing SHA-256 fingerprints, and it is deployed.
- [ ] Turnstile accepts the shell origins. See `docs/turnstile.md`. Do not turn CAPTCHA off.
- [ ] `review@hoppinclub.com` exists, with a trip that has days, a map, money, and a document. The password is only in the review reply, not in git.
- [ ] Firebase files are on the build machine, the Android Google services plugin lines are applied, and `FCM_SERVICE_ACCOUNT` is set. A test push arrives and opens the trip.
- [ ] Screenshots in `docs/store/assets/` are captures of this build. See `listing.md`.
- [ ] Release archive uses `App.release.entitlements` (`aps-environment` production).

## On real phones

- [ ] TestFlight: at least 3 people on real iPhones. Sign-up with the confirm link, reset password, invite link, push, save a poster to Photos, cold start in airplane mode. No crash.
- [ ] Play closed test: the same list on two Android phones, one of them low-end. 12 testers opted in for 14 continuous days before production.
- [ ] Both releases are manual. You choose the moment they go live.

## Send

- [ ] iOS submitted for review with the review notes pasted and the demo account filled in.
- [ ] Android sent to production only after the 14 days, with managed publishing on.
