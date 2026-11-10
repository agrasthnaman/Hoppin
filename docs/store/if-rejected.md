# If a store rejects the build

The owner answers, from support@hoppinclub.com. Reply in the store, fix the build, and send the same version's next build number (bump `CURRENT_PROJECT_VERSION` and `versionCode` together). Do not add a payment, a social login, or a permission the app does not use, in order to get through review.

Read the guideline number in the rejection, then:

| Guideline | What they are usually saying | What to check |
| --- | --- | --- |
| Apple 4.2, minimum functionality | The app looks like a website in a frame. | The binary is the bundled shell, not a remote `server.url`. Review notes already name push, the share sheet, the calendar file, and the system photo picker. Point the reviewer at those, and at Days, Map, Money, and Docs. |
| Apple 5.1.1, or Google data deletion | Account deletion or the privacy label does not match the app. | Account, then Delete my account. Compare the privacy page, `questionnaires.md`, and the data-safety form. A push token is collected only after the person turns notifications on, and it is deleted on sign-out and on account deletion. |
| Apple 2.1, completeness | The reviewer could not sign in, or the demo crashed. | `review@hoppinclub.com` works, Turnstile is left on, and the review notes say how to reach Days, Map, Money, Docs, posters, and Account. Cold start in airplane mode opens the saved trip. |
| Apple 3.1.1, payments | Something looks like a purchase that happens outside the app. | There is no price, upgrade, premium, or subscribe in the app. Do not add a link that sends someone to pay on the web. |

Google's equivalents are the data-safety form, the closed-test requirement (12 testers, 14 days), and the "app is a WebView" policy. The same fixes apply: a bundled shell, the privacy form matching the privacy page, and the closed test finished before production.

Crashes and reviews are checked in App Store Connect and Play Console. The app does not send crash reports to Hoppin.
