# Review notes

Hoppin is a shared place for one group's trip. The people on that trip share the days, the map, the money, and the documents. There is no public feed and no chat.

These notes describe the app in this repository. The privacy and terms pages are in the app at `/privacy` and `/terms`. They are not on the public site until the next deploy.

## How to sign in

Use the normal email and password form. A Cloudflare Turnstile check runs on that form. Leave it on. Do not turn CAPTCHA off.

The owner creates `review@hoppinclub.com` outside this repository and sends the password to the reviewer through the store, not through the repo. This repository does not contain a password or a live account.

Sign-in is email and password only. There is no social login.

## Where to look

After sign-in, open a trip. The trip screen has Days, Map, Money, Docs, and More.

- **Days** is the plan, one day at a time.
- **Map** is the stops.
- **Money** is who paid, and who owes whom. The amounts are notes the group types. Nothing is charged.
- **Docs** is tickets and other files the group adds.
- **Posters:** More, then Make a poster. The poster is drawn on the device. Photos picked for it stay on the device and are not uploaded. Save picture and Play trip give a light haptic tap on a phone.
- **Account:** More, then Account. From the trip screen that is two taps. The trips list also has Account in the header, one tap.

There is no payment, no subscription, and no place to enter a card.

## Permissions

The app does not ask for the camera, the microphone, the device location, or payment.

- **Photos and files.** Choosing a poster photo or a document uses the system file picker. Poster photos are not uploaded. A file added as a trip document is uploaded to private storage for that trip. A shared document is visible to approved members. A personal document is visible to the person who added it and to that trip's organizers.
- **Notifications.** Updates show inside the app. Each person can turn email updates on or off for a trip. Phone notifications are off until the person turns them on, after they have a trip, from a one-line offer or from Updates. The app then asks for the system notification permission and stores that phone's token. Signing out removes the token. Deleting the account removes every token. Tapping a notification opens that trip.
- **Share.** An invite link, a poster picture, and the calendar file use the system share sheet on the phone. The website uses the browser share sheet.
- **Calendar.** Add to calendar shares the same calendar file the website downloads. The phone calendar opens it. The app does not ask for calendar access. Times are the same absolute times as the file the website already exports. A stay uses the plan's own time zone for its dates.
- **Photos.** The poster picker is the system file picker (`accept="image/*"`, multiple). There is no photo-library permission string, because the app does not use a photo plugin. Poster photos are not uploaded.
- **Network.** Sign-in and sync need a connection. A copy of the trip is kept on the device for offline use.

## Contact

support@hoppinclub.com
