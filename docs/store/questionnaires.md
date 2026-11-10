# Store questionnaires

Answers for the store forms. Each one matches the privacy page (`/privacy`) and the terms page (`/terms`) in this repository. Those pages are not deployed until the next release, so do not paste a live privacy URL until that deploy is done.

Contact for every form: support@hoppinclub.com

## Sign in with Apple

Not required. Hoppin uses only email and password. Do not add social logins.

## Apple age rating

Answer **None** for every content frequency: cartoon or fantasy violence, realistic violence, sexual content and nudity, profanity or crude humor, alcohol tobacco or drug use, mature or suggestive themes, horror, and gambling.

- No user-generated public content. Members add text, notes, plans, expenses, polls, and files. Those are visible only to approved members of that trip. A personal document is also visible to that trip's organizers. There is no public profile, no public feed, and no chat.
- No unrestricted web access. The app does not contain a browser.
- Not made for kids. The product has no age gate, so do not claim one.

## Google content rating

- Violence, fear, sexuality, profanity, controlled substances, gambling: **No**.
- No chat. No public user-generated content.
- People on a trip can add text and files that the other approved members of that trip can see, and organizers can see personal documents. Nobody outside the trip can.
- No location sharing from the device. The app does not read GPS.
- No unrestricted web view.

## Google Data safety

Data is not sold. There are no ads and no tracking kits. Data is sent over HTTPS. The person can delete the account in the app: Account, then Delete my account. What that removes, and what it leaves, is on the privacy page.

**Collected, for the app to work, and linked to the account**

- Email address.
- Name (the display name).
- User content the person adds: trips, plans, expenses (amounts the group types, not a card or a bank), polls, and documents. An image added as a document is stored with the trip.
- The email-updates choice for each trip, and the phone-notification choice for each trip.
- A push notification token, only if the person turns phone notifications on. It is removed when they sign out of that phone, and when they delete the account.

**Not collected**

- Device location (no GPS). A place the group types or picks is part of the trip, not the phone's location.
- Photos chosen only to make a poster. Those stay on the device and are never uploaded.
- Advertising ID or other tracking identifier.
- Crash logs, diagnostics, or content-security reports.
- Contacts, SMS, microphone, camera, or payment info.

**Processors, matching the privacy page**

- Supabase: database, sign-in, and file storage.
- Cloudflare: hosting, the Turnstile bot check, and email routing for support@hoppinclub.com.
- Resend: email (invites, password resets, trip updates).
- Firebase Cloud Messaging: delivers a phone notification only when the person turned that on. It receives the token and a short note (trip name and how many plans changed), not the email.
- OpenFreeMap and Photon: map tiles and place search. A map view or a search contacts them. The request does not include the person's email.
- Open-Meteo: weather and destination lookup. Same, no email.
- Frankfurter: exchange rates. Same, no email.
- The public home page loads stock photos from Unsplash. That page does not send the account.

## Apple privacy nutrition label

Data is used for app functionality. It is not used for tracking. It is not sold.

**Linked to the account**

- Contact info: email address.
- Name: display name.
- User content: trips, plans, expenses, polls, and documents, including an image the person adds as a document.
- Identifiers: the account id.

**Not collected**

- Photos or videos chosen only for a poster.
- Precise or coarse location from the device.
- Purchases, payment info, health, contacts.
- Browsing history or a stored search history. Place search is sent to Photon and is not kept as a history.
- Diagnostics, crash data, or content-security reports.
- Device ID or advertising data.
- A push token is collected only when the person turns phone notifications on. Declare it as an identifier used for app functionality, linked to the account, and not used for tracking. It is deleted on sign-out of that phone and on account deletion.
