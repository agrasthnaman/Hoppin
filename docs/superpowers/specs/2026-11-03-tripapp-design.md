# TripApp: Shared Group Trip Planner — Design

Working name: "TripApp" (placeholder). Inspired by TripMojo.

## Intent and why

When a group of ~10 travels together, different people make different bookings (flights, stays, activities). The details end up scattered across chats and inboxes. Pain points the owner described:

- Immigration needs every stay and every ticket for everyone, as documents. Someone has to chase people and compile them.
- "Where are we staying?" / "What's planned on day 3?" gets asked repeatedly; the organizer re-relays the plan every time something changes.
- Bookers ping the organizer with details; the organizer then has to iterate and re-share with everyone.
- A traveller with no internet abroad still needs to look things up.

Goal: one shared trip page (web first, iOS/Android later) where the whole group can see the plan, bookings, documents, locations and money, without asking anyone, including offline.

## Roles

- **Organizer**: creates the trip, invites people, controls who can edit. Can edit everything.
- **Member**: sees all shared content; can add personal and shared items; can RSVP to optional plans.
- **Booker/contributor**: any member who made a booking can add and edit that booking's details and documents themselves. *(Builder's call on how this is enforced: edit rights on items one created; organizer can grant broader edit rights.)*

## v1 features

### 1. Trip, invites, access
- Organizer creates a trip (name, dates, destination(s)).
- Invite via link. Joiners need minimal sign-up. Organizer approves new joiners. *(My call.)*

### 2. Itinerary (day view)
- Each day is a timeline. **Group items** (flights, hotel, fixed bookings, group activities) are solid blocks.
- **Member items** have a visibility: **Just me** (private, shown only to the owner as a muted dashed line) or **Everyone**.
- Shared member items go live immediately, with no organizer approval (owner's decision).
- Shared optional items appear as **small avatar chips** (initial + short title) inside the matching time slot, not as full blocks (owner picked this over a side lane and a collapsed "+N" row). Tapping a chip opens details: what, where, location link, who's interested. Anyone can tap **"I'm in"**. *(RSVP is my suggestion.)*

### 3. Bookings and documents
- Bookings: flights, stays, activities, transport, with details, location URL and confirmation documents attached.
- Everyone in the group can see shared bookings and download their documents.
- **Per-person documents** (passport, visa, own tickets) are private to that traveller plus the organizer *(my call; to be confirmed)*.
- **One-tap export** for immigration: one PDF or share link containing all stays and all tickets for everyone.

### 4. Expenses
- Each booking records who paid, how much, and who it's split between (all, or some).
- App shows who owes whom, with the fewest payments needed to settle.

### 5. Today view
- On trip days the app opens to "now and next": next item, where to be, stay address, Maps link.

### 6. Offline
- The whole trip (itinerary, bookings, location links, documents and tickets, expense data) is cached on the device and refreshed whenever there's internet.
- Edits made offline queue and sync later. Conflict handling is left to the builder, but must not silently lose edits.
- Offline documents and tickets are the highest priority part of offline.
- Approach (my call): installable web app (PWA) with local storage, so web and offline both work from day one.

### 7. Notifications
- When a booking or plan changes, members get a short "what changed" alert, so nobody needs to ping the organizer.

### 8. Poll
- Anyone can create a poll in the trip (e.g. "which restaurant?"). Members vote; results are visible to all. *(Detail left to the builder: single vs multi-choice, closing, linking a winner into the itinerary.)*

### 9. Weather per day
- Each trip day shows a forecast for that day's location.

### 10. Currency conversion
- Amounts can be viewed in the user's home currency; conversion supports expenses and bookings.

### 11. Map of each day's stops
- Each day has a map showing that day's stops in order.

## Goals
- Any member can answer "where, when, what, who paid" in seconds, without asking the organizer.
- Updating a booking is done by the booker, once, and everyone sees it.
- Works with no signal.

## Non-goals (v1)
- Native iOS/Android apps (later; backend must be reusable by them).
- Packing checklist, auto-importing bookings from email (later ideas).
- Real payments / money transfer inside the app (it only tracks who owes whom).

## Anti-goals
- A day view cluttered by members' optional plans.
- Organizer becoming a bottleneck for approvals or relaying info.
- Offline mode that shows stale data without making that clear, or that loses edits.

## Constraints and decisions
- Web app first; mobile later. Trip size around 10 people.
- Owner is flexible on technology and handed the choice to the builder; the only fixed requirement is that the backend serves both web and future mobile apps, and offline works.
- Version control (GitHub) will be set up later.
- Suggested build order (my call): (1) core trips, invites, itinerary, bookings, documents; (2) offline and Today view; (3) expenses and currency; (4) polls, weather, day map, notifications.

## Left to the builder
Tech stack, hosting, authentication method, data model, document storage, sync and conflict strategy, weather and maps and currency providers, notification channel (push, email, in-app).

## Builder's-check calls (my calls, not yet agreed with the owner)
- **Sign-up:** passwordless. Name + email, sign in with an emailed link. Needed for notifications and for recovering access on a new device.
- **Notifications v1:** in-app plus email. Web push where the device supports it. Changes are batched for a few minutes so one edit session sends one alert.
- **Edit rights:** the creator of an item and the organizer can edit it. Other members cannot edit it. The organizer can grant edit rights per person. Every change is recorded in a change history, which feeds notifications and sync conflicts.
- **Expenses:** each expense is stored in the currency it was paid in, with the exchange rate captured when it is entered. Settlement is computed in one trip base currency. Equal split by default, custom amounts allowed. People who are not app users (a child, a partner) can be added as named guests in a split.
- **Stale or failed offline data:** show a "last synced" time on every screen, with a warning after 24 hours offline. Offline edits sync later; if the same field was changed by someone else, last write wins and the overwritten person sees a visible notice. Nothing is dropped silently.
- **Time zones:** item times are local to the item's location and stored with their time zone, so flights across zones are correct.
- **Immigration export:** a generated PDF with a summary page (stays and tickets per person) followed by the original uploaded documents.
- **Offline storage size:** assume at most a few hundred MB per trip. Test on real iPhones early, because iOS can evict web-app storage.

## Owner's answers to the builder's questions
- **Export as a link (owner: yes):** the immigration export is also available as a share link that opens without login. It expires after a set time and the organizer can revoke it.
- **iOS (owner: yes):** if testing shows the web app loses offline data on iPhones, the native/wrapped iOS app moves earlier. Plan real-iPhone offline testing in the first offline milestone, and keep the backend reusable by a native app.

## Calls on the two questions the owner did not answer (my calls, please check)
- **Passports and visas:** stored in the app, visible only to the owner and the organizer, cached offline only in encrypted form and behind a device lock where the platform allows. Left out of the immigration export by default; each traveller can choose to include theirs.
- **Scale:** build it for one friend group first. Keep trips and accounts separate in the data model so it can serve many groups later. Prefer free or cheap tiers for maps, weather and currency, behind a swappable layer.
