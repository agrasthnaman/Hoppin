# Hoppin on a phone

The iOS and Android apps are a shell around the same web app. They do not load hoppinclub.com. `cap sync` copies a production build into the native project.

Sign-in is email and password only. There is no Google or Facebook login, so Sign in with Apple is not required and is not part of v1.

## What you need

- Node 22 or newer, and the repo's `npm install` (the lockfile uses the JFrog registry).
- iOS: Xcode (Mac App Store). The project uses Swift Package Manager, so CocoaPods is not needed. An Apple developer account is only needed for a real phone.
- Android: Android Studio, and JDK 21 (the Gradle files target Java 21; Android Studio bundles one). The emulator is an Android system image with a WebView from the last few years (API 24 is the minimum; WebGL maps need a current WebView).

## Build and run

From the repo root:

```bash
npm run cap:ios
npm run cap:android
```

Each command builds the web app, copies it into the native project, and opens a simulator or emulator. `npm run cap:sync` only builds and copies.

To live-reload against a local dev server, for that one command only:

```bash
CAP_SERVER_URL=http://localhost:5173 npm run cap:ios
```

Do not leave `CAP_SERVER_URL` set for a build you ship. The committed config has no `server.url`.

The app starts at `/`. Client routes (`/trips/...`, `/sign-in`) are handled by the same browser router as the website. The shell's local server falls back to `index.html`, so a deep path still loads after the app is killed and opened again.

## Version

The user-facing version lives in two places. Keep them equal.

- iOS: `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in `apps/web/ios/App/App.xcodeproj/project.pbxproj`.
- Android: `versionName` and `versionCode` in `apps/web/android/app/build.gradle`.

`versionCode` / `CURRENT_PROJECT_VERSION` only go up.

## Signing

Nothing secret is committed.

- iOS: Xcode signs with your Apple team. The Team ID is not in the repo until the owner adds it. Automatic signing in Xcode is enough for a simulator; a device needs a provisioning profile, which stays in Xcode and the Apple account.
- Android: `apps/web/android/local.properties` (sdk path) is gitignored. A release keystore is created by the owner and is not committed. Debug builds use the debug keystore Android Studio creates on the machine.

The Supabase anon key is public by design and is baked in at build time from the web env, the same way as the website. No service role key belongs in either native project.

## Origins

- Android serves the app at `https://localhost`.
- iOS serves it at `capacitor://localhost`.

`/api` calls from the shell go to `https://hoppinclub.com` (see `apiBase` in `apps/web/src/lib/native-shell.ts`). The website keeps relative `/api` URLs.

## Email and invite links

Confirm, password-reset and trip-invite links are normal `https://hoppinclub.com` links. With the app installed they open the app (`toAppPath` in `apps/web/src/lib/app-link.ts`). Without it they open the website. There is no custom URL scheme.

Before this works on a phone the owner still has to:

- Replace `TEAMID` in `apps/web/public/.well-known/apple-app-site-association` with the Apple Team ID, then deploy the site. The file must stay `application/json` (see `apps/web/public/_headers`).
- Put the SHA-256 fingerprints of the Android debug key, the upload key and the Play app-signing key into `apps/web/public/.well-known/assetlinks.json`. The list is empty until those exist.
- In the Supabase dashboard, Redirect URLs already include hoppinclub.com. No extra scheme is required. If a custom scheme is ever added, it must be added to `uri_allow_list` too.

`curl -I https://hoppinclub.com/.well-known/apple-app-site-association` returns the file only after that deploy.

## Phone features

The website keeps its own behaviour. These only change the shell.

- **Share.** Invite links, poster pictures, and the calendar file use the system share sheet. A poster is written to the app cache, shared, then deleted. The website still uses `navigator.share`, and downloads the file when the browser cannot share one.
- **Calendar.** "Add to calendar" shares the same `.ics` the website downloads. The phone's calendar app opens it. There is no calendar permission. Times stay the absolute times that file already uses. A stay's dates use the plan's own time zone.
- **Photos.** Posters keep `<input type="file" accept="image/*" multiple>`. That opens the system picker. No `NSPhotoLibraryUsageDescription`, because there is no photo plugin. On a real mid-range Android phone, pick 14 photos and confirm the studio does not crash. `loadForPoster` already downsizes them.
- **Haptics.** Play trip and Save picture make a light tap. Nothing is asked for.
- **Phone notifications.** Off until the person has a trip and taps Turn on notifications (or the Phone notifications switch in Updates). The token is stored in `push_tokens` for that account. Signing out deletes this device's token. Deleting the account deletes every token. Tapping a notification opens the trip. The 5-minute digest job sends the note only when `FCM_SERVICE_ACCOUNT` is set. Without it, in-app updates and email still go out.

The owner still has to, outside this repo:

1. Create a Firebase project. Add an iOS app (`club.hoppinclub.app`) and an Android app (the same id).
2. Create an APNs key in the Apple developer portal (Keys, Apple Push Notifications service). Upload that `.p8` to Firebase, with the Key ID and the Team ID. Do not commit the `.p8`.
3. Download `GoogleService-Info.plist` into `apps/web/ios/App/App/` and add it to the App target in Xcode. Download `google-services.json` into `apps/web/android/app/`. Both paths are gitignored.
4. Android needs nothing more: `apps/web/android/build.gradle` already has the `com.google.gms:google-services` classpath, and `apps/web/android/app/build.gradle` applies the plugin only when `google-services.json` is present (so a machine without the file still builds, just without push). The notification permission comes with Firebase Messaging.
   iOS is not finished. `AppDelegate.swift` does not yet pass the device token on to Capacitor (`capacitorDidRegisterForRemoteNotifications`), so registration never completes; and the plugin then hands over an APNs token, while the digest job sends through FCM, which needs an FCM token. The app needs the Firebase Messaging SDK on iOS to turn one into the other.
5. Put the Firebase service-account JSON in the Supabase secret `FCM_SERVICE_ACCOUNT`. Never commit it. The same `DIGEST_SECRET` authorises the test send.

Debug builds use `aps-environment` development (`App.entitlements`). The Release archive uses `App.release.entitlements`, which is `production`.

A test note, after a phone has registered:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/send-test-push" \
  -H "x-digest-secret: $DIGEST_SECRET" \
  -H "content-type: application/json" \
  -d '{"user_id":"<the signed-in user uuid>"}'
```

`503` means the Firebase secret is missing. `404` means that person has no token yet.

## Store accounts

Do these in a browser. Nothing here belongs in git.

### Apple

1. Go to [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll) and enrol in the Apple Developer Program. The fee is paid to Apple on that site, not in the app.
2. In Certificates, Identifiers & Profiles, register an App ID with bundle id `club.hoppinclub.app`. Enable Associated Domains and Push Notifications.
3. In App Store Connect, Apps, then the plus, then New App. Platform iOS. Name Hoppin. Primary language English. Bundle ID `club.hoppinclub.app`. SKU `hoppin-ios`. User access Full access.
4. Leave the release as manually release. Do not start selling, and do not add a price other than free.
5. Age rating: answer None to every content question. See `docs/store/questionnaires.md`.
6. Privacy policy URL `https://hoppinclub.com/privacy` and support URL `https://hoppinclub.com`, only after those pages are deployed.
7. Paste the review notes from `docs/store/review-notes.md`. Send the reviewer password for `review@hoppinclub.com` in the App Review contact field, not in the repo.

An App Store Connect API key is optional. If you create one (Users and Access, Integrations, App Store Connect API), store the `.p8` outside the repo.

### Google

1. Go to [play.google.com/console/signup](https://play.google.com/console/signup) and create a Play Console account. The fee is paid to Google on that site.
2. Create app. App name Hoppin. Default language English. App, not a game. Free. Confirm the content declarations.
3. Play App Signing: let Google manage the app signing key. Create an upload keystore on this machine, outside the repo. Do not commit the keystore or its passwords.
4. The day the first `.aab` exists, open Test, then Closed testing, create a track, upload the bundle, and add 12 Gmail addresses. Each person must open the opt-in link and stay opted in for 14 continuous days. Do not apply for production before those 14 days are done.
5. After the 14 days, send the app to production with managed publishing turned on, so you choose the go-live moment.

## Shipping a build

The user-facing version is `apps/web/package.json` `version`. It must equal `MARKETING_VERSION` in `apps/web/ios/App/App.xcodeproj/project.pbxproj` and `versionName` in `apps/web/android/app/build.gradle`. `CURRENT_PROJECT_VERSION` and `versionCode` only go up, and they stay equal to each other.

```bash
npm run cap:sync
```

Then:

- iOS: open `apps/web/ios/App/App.xcworkspace` in Xcode. Signing team is your Apple team (automatic). Product, Archive. Distribute to App Store Connect. TestFlight. At least 3 people on real iPhones run: sign-up with the email confirm link, reset password, invite link, a test push, save a poster to Photos, and open the app in airplane mode.
- Android: from `apps/web/android`, `./gradlew bundleRelease`, signed with the upload keystore. Upload the `.aab` to the closed track. Run the same list on two real phones, one of them low-end.

v1 is iPhone only (`TARGETED_DEVICE_FAMILY = 1`). Do not add an iPad target, and do not upload iPad screenshots.

Listing text, the screenshot sizes, and the pre-submission list are in `docs/store/`.

## After it is submitted

Check crashes and reviews here. There is no crash reporter in the app.

- Apple: App Store Connect, the app, then Ratings and Reviews, and TestFlight or Xcode Organizer for crashes.
- Google: Play Console, the app, then Reviews, and Android vitals.

If a build is rejected, use `docs/store/if-rejected.md`. The person who answers is the owner, at support@hoppinclub.com.
