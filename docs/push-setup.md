# Phone notifications: setup, testing and the iOS changes

A hand-over guide for building and testing push notifications on your own computer. Android is ready to build and
test. iOS needs a few changes in Xcode (section 5). Everything on the server side is already live.

## 1. What is already live (server)

The 5-minute job `send-digest` turns each trip's changes into one digest per member: an in-app update (the bell), an
email (unless the member turned email off), and a phone notification for members who turned phone updates on.

| Piece | Where | State |
|---|---|---|
| `send-digest`, `send-push`, `join-signup-queue`, `drain-signup-queue` | Supabase Edge Functions | Deployed |
| `DIGEST_SECRET`, `RESEND_API_KEY`, `DIGEST_FROM` (`Hoppin <updates@hoppinclub.com>`), `FCM_SERVICE_ACCOUNT`, `SITE_URL`, `DRAIN_SECRET`, `TURNSTILE_SECRET_KEY` | Supabase function secrets | Set |
| `digest_secret`, `drain_secret` | Supabase Vault (read by the scheduled jobs) | Set, equal to the function secrets |
| `send-digest` every 5 minutes, `drain-signup-queue` hourly at :05 | `pg_cron` jobs | Active |

The first run sent 8 in-app updates and 8 emails with no failures. Phone notifications go out as soon as a phone has
registered (nobody has yet).

To change `DIGEST_SECRET` or `DRAIN_SECRET`, change the function secret and the Vault entry to the same new value,
or the job is refused (401). Both values are kept in the repo's root `.env` (never committed).

## 2. Files to bring to the other computer (never commit them)

None of these are in git. Carry them over by a private route (a password manager, an encrypted drive, AirDrop), not
email or chat.

| File | Goes to | What for |
|---|---|---|
| `google-services.json` | `apps/web/android/app/google-services.json` | Android app's Firebase config (receiving pushes) |
| `GoogleService-Info.plist` | `apps/web/ios/App/App/GoogleService-Info.plist` | iPhone app's Firebase config |
| Root `.env` | repo root | Release credentials and the two job secrets |
| `apps/web/.env.local` | `apps/web/.env.local` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and **`VITE_TURNSTILE_SITE_KEY`** |

`VITE_TURNSTILE_SITE_KEY` must be in `apps/web/.env.local`. Supabase requires the bot check on sign-up and sign-in,
so an app built without the key cannot sign anyone in.

The Firebase service-account JSON (the private key that sends pushes) is **not** needed on the other computer. It
lives only in the Supabase secret `FCM_SERVICE_ACCOUNT`. If you have a copy, keep it in a password manager.

The two Firebase app files can also be downloaded again: Firebase console > project **hoppinclubs** > gear icon >
Project settings > General > your Android or iOS app.

## 3. Getting the repo ready

```bash
git clone https://github.com/agrasthnaman/Hoppin.git && cd Hoppin
npm install          # Node 22 or newer
# put the four files from section 2 in place
npm test             # optional: everything should pass
```

## 4. Android

### Tools
Install [Android Studio](https://developer.android.com/studio). It brings the Android SDK and a JDK. The project needs
JDK 21: in Android Studio, Settings > Build, Execution, Deployment > Build Tools > Gradle > Gradle JDK > pick a 21.

### Nothing to change in the project
Already in the repo (checked against the code, not just the docs):
- `apps/web/android/build.gradle` has `classpath 'com.google.gms:google-services:4.4.4'`.
- `apps/web/android/app/build.gradle` applies the Google services plugin only when `google-services.json` is there,
  so a machine without the file still builds, just without push.
- The push plugin requests the Android 13+ notification permission. Firebase Messaging declares it in the manifest.
- On Android the plugin hands over an FCM token, which is what the server sends to.

### Build and run on a phone
```bash
npm run cap:sync -w apps/web     # builds the web app and copies it into the native projects
```
Open `apps/web/android` in Android Studio, connect an Android phone by USB (Settings > About phone > tap Build number
7 times > Developer options > USB debugging), pick it at the top and press Run.

Or from the terminal: `npm run cap:android -w apps/web`.

### Test it
1. In the app: sign in, open a trip, tap **Turn on notifications** and allow them. (Or: the trip's Updates page >
   Phone notifications.)
2. Check the phone registered. In the Supabase SQL editor:
   ```sql
   select platform, created_at from push_tokens order by created_at desc;
   select trip_id, push_on from members where user_id = '<your user id>';
   ```
   Your user id: `select id from auth.users where email = '<your email>';`
3. Send a test notification straight to your phone:
   ```bash
   curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/send-push" \
     -H "x-digest-secret: <DIGEST_SECRET from .env>" -H "Content-Type: application/json" \
     -d '{"user_id": "<your user id>"}'
   ```
4. The real thing: have someone else in the trip change a plan. Within about 10 minutes (the 5-minute window plus the
   next run) the digest arrives, and tapping it opens the trip.

## 5. iOS (changes to make on the Mac)

Needs a Mac with **Xcode** (Mac App Store) and an **Apple Developer** account. Push does not work in the simulator;
use a real iPhone.

### Why changes are needed
Checked in the code:
- `AppDelegate.swift` does not pass the device token on to Capacitor, so **Turn on notifications** waits 20 seconds
  and fails.
- On iOS the push plugin hands over an **APNs** token, but the server sends through Firebase (FCM), which needs an
  **FCM** token. The Firebase Messaging SDK turns one into the other.
- `GoogleService-Info.plist` is in the folder but not part of the app (the Xcode project does not list it).

### 5.1 Apple and Firebase (once)
1. Apple Developer > Certificates, Identifiers & Profiles > **Keys** > + > tick **Apple Push Notifications service
   (APNs)** > download the `.p8` (only possible once). Note its Key ID and your Team ID.
2. Firebase console > hoppinclubs > Project settings > **Cloud Messaging** > Apple app configuration > APNs
   Authentication Key > upload the `.p8` with the Key ID and Team ID.
3. In Apple Developer > Identifiers > `club.hoppinclub.app`, check **Push Notifications** is enabled. The app's
   entitlements already ask for it (`App.entitlements`: development, `App.release.entitlements`: production).

### 5.2 Add Firebase Messaging to the App target
`npm run cap:sync -w apps/web`, then open `apps/web/ios/App/App.xcodeproj` in Xcode.

File > Add Package Dependencies > `https://github.com/firebase/firebase-ios-sdk` > Dependency Rule "Up to Next Major"
> Add Package > tick only **FirebaseMessaging** > target **App** > Add Package.

Add it to the **App** target, not to `CapApp-SPM/Package.swift`: Capacitor rewrites that file on every sync.

### 5.3 Put `GoogleService-Info.plist` into the app, without breaking machines that lack it
Do **not** drag the file into the project: the project file is committed and the plist is not, so every other
machine (and CI) would fail with "Build input file cannot be found". Copy it in a build step instead:

1. Select the **App** target > Build Phases > + > New Run Script Phase. Drag it below "Copy Bundle Resources".
2. Script:
   ```sh
   PLIST="${SRCROOT}/App/GoogleService-Info.plist"
   if [ -f "$PLIST" ]; then
     cp "$PLIST" "${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/GoogleService-Info.plist"
   else
     echo "warning: GoogleService-Info.plist not found, phone notifications are off in this build"
   fi
   ```
3. Input Files: add `$(SRCROOT)/App/GoogleService-Info.plist`. Output Files: add
   `$(TARGET_BUILD_DIR)/$(UNLOCALIZED_RESOURCES_FOLDER_PATH)/GoogleService-Info.plist`. (Newer Xcode sandboxes build
   scripts; declared inputs and outputs are what let it read and write these.)

### 5.4 `AppDelegate.swift`
Replace the file's imports and `didFinishLaunchingWithOptions`, and add the two token methods inside the class:

```swift
import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Only when the Firebase file was built in (see the build step): a build without it still runs, without push.
        if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil {
            FirebaseApp.configure()
        }
        return true
    }

    // Apple gives a device (APNs) token. The server sends through Firebase, so hand Capacitor the FCM token instead.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        guard FirebaseApp.app() != nil else {
            NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: NSError(domain: "push", code: 1))
            return
        }
        Messaging.messaging().apnsToken = deviceToken
        Messaging.messaging().token { token, error in
            if let token = token {
                NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: token)
            } else {
                NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error ?? NSError(domain: "push", code: 2))
            }
        }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    // ... keep the other methods of the file as they are (applicationWillResignActive, the scene configuration, ...)
}
```

The push plugin accepts a token passed as a string (`PushNotificationsPlugin.swift`), so the app code
(`apps/web/src/lib/push-register.ts`) needs no change: it saves whatever token it gets with platform `ios`.

### 5.5 Build, run, test
1. Select the **App** target > Signing & Capabilities: your Team; check **Push Notifications** is listed (add it with
   + Capability if not).
2. Connect the iPhone, pick it at the top, press Run.
3. Test exactly as for Android (section 4, "Test it"). `push_tokens.platform` should say `ios`, and the token should be
   a long FCM token, not 64 hex characters (that would be a raw APNs token, meaning step 5.4 is not in effect).

### 5.6 Commit
Commit `AppDelegate.swift` and `App.xcodeproj/project.pbxproj` (the package and the build step). Never commit
`GoogleService-Info.plist` or the `.p8`. Check `git status` before committing.

## 6. Troubleshooting

| What you see | Likely cause |
|---|---|
| Sign-in says it could not confirm you are a person | `VITE_TURNSTILE_SITE_KEY` missing from `apps/web/.env.local` when the app was built. Add it, then `npm run cap:sync -w apps/web` again. |
| "Turn on notifications" spins, then fails (iOS) | Section 5.4 not applied, or the app is not signed with the Push Notifications capability. |
| A token is saved, but no notification arrives | Android: `google-services.json` was missing at build time (the build log says "google-services plugin not applied"). iOS: APNs key not uploaded to Firebase (5.1), or a raw APNs token was saved (5.5 step 3). |
| Test push returns 503 | `FCM_SERVICE_ACCOUNT` missing in Supabase. |
| Test push returns 401 | Wrong `x-digest-secret`. |
| Digests stopped | Supabase SQL editor: `select status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;` and `select status_code, content from net._http_response order by id desc limit 5;` |

## 7. Releasing a new version afterwards

```bash
npm run release -- --env .env --functions
```
Tests, database migrations, the website and the Edge Functions, in that order. The phone apps are built and
uploaded to the stores separately (see `docs/store/`).
