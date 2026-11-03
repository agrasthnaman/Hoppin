# Hoppin Work Plan: How to Pick Issues

Issues are numbered as on the [issues page](https://github.com/agrasthnaman/Hoppin/issues). Each lists what it depends on. This page says **in what order** to pick them and **who should take what**.

## 1. The rule

Pick the lowest-numbered wave below that has an open issue whose dependencies are all closed. Do not start an issue whose dependencies are still open, except to read it.

## 2. Waves (what can run in parallel)

| Wave | Issues you can start (all can run at the same time) | Starts when |
|---|---|---|
| 1 | #1 accounts and environments, #2 API keys, #3 workspace scaffold | Now |
| 2 | #4 design system, #5 schema and privacy rules, #18 settlement logic, #19 currency conversion | #3 is done (#5 also needs #1) |
| 3 | #6 sign-in and invites, #7 app shell, #8 image pipeline, #10 day view, #11 bookings and documents, #21 polls | Their wave-2 parents are done (#8 also needs #2) |
| 4 | #9 trips list, #12 members screen, #13 offline cache, #17 motion, #20 expenses and Money screen, #22 weather, #23 day map, #24 notifications, #25 immigration export | Their wave-3 parents are done |
| 5 | #14 offline edits, #15 Today view, #16 iPhone offline check, #26 visual and accessibility QA, #27 security review, #28 deploy | #13 and the other parents are done |
| 6 | #29 real-trip beta | #26, #27 and #28 are done |

## 3. The critical path (protect this)

#3 scaffold → #5 schema → #10 day view and #11 bookings → #13 offline cache → #16 iPhone offline check → #26 QA → #29 beta.

- Anything on this path should be picked first and by the strongest available person.
- **Offline is the biggest risk.** Start #13 the moment #10 and #11 are done. #16 is a decision gate: if iPhones lose the offline data, stop and bring the result to the owner, because the native iOS app then moves earlier.
- #5 is the biggest bottleneck: almost everything reads its tables. Keep it small, merge it fast, and agree table names in the issue before coding.

## 4. Suggested tracks (one person per track works well; fewer people can double up)

| Track | Skills | Issues, in order |
|---|---|---|
| Platform | Cloud accounts, DevOps | #1, #2, then #28 |
| Backend | Postgres, security rules | #5, #6, #24, #25, then #27 |
| Frontend and design | React, CSS, motion, accessibility | #4, #7, #8, #10, #9, #12, #17, #23, #26 |
| Offline and logic | TypeScript, testing, data sync | #3, #13, #14, #15, #16, #18, #19, #20, #21, #22, #11 |

#3 is on the offline-and-logic track but must be done first by someone, so that person starts on day one. #11 (bookings and documents) can go to whichever of Backend or Offline and logic is free first.

### If the team is smaller
- **1 person:** follow waves in order, and finish the critical path items before the side items in the same wave. Take #13 and #16 before #22, #23 and #21.
- **2 people:** one takes Backend plus Platform, the other takes Frontend plus Offline and logic.
- **4 people:** use the tracks above as written.

## 5. Working rules

- **Claim before you start.** Assign yourself or comment. If there's no update for 3 days, the issue goes back to the pool.
- **One issue per person at a time**, and at most two open pull requests per person.
- **Shared files cause conflicts.** `types.ts` (core types) and the database migrations are shared.
  - #5 owns `001_core.sql` and the first version of `types.ts`. Later issues add only to the end of those files.
  - Migration numbers are reserved so nobody collides: 001 core (#5), 002 polls (#21), 003 share links (#25), 004 images (#8), 005 expenses (#20), 006 notifications (#24).
- **Interfaces first.** If your issue produces something another issue uses, open a small pull request with just the signatures and tests first, so the next person can start sooner.
- **Reviews:** someone other than the author reviews. Review requests are picked up before new issues.
- **Found a gap?** Open a new issue in the right phase and label it. Don't expand your own issue.

## 6. Phase exits (don't start the next phase's wave 4 items until the phase exit holds)

| Phase | Exit check |
|---|---|
| 0 | A new contributor can clone, install and run the tests; a dev Supabase project exists |
| 1 | A user can sign in, create a trip, invite someone, add items and bookings, and see the day view; a second account cannot see private items |
| 2 | Trip opens fully offline on a real phone; offline edits sync; **#16 result recorded** |
| 3 | Expenses split correctly and settle up with a guest and a foreign currency |
| 4 | Poll, weather, day map and notifications work; the immigration PDF and link work |
| 5 | The security review is clean and a full trip has run on the app |

## 7. Pick order if you just want a single list

#1, #2, #3, #5, #4, #10, #11, #13, #6, #7, #8, #16, #14, #15, #18, #19, #9, #12, #20, #17, #21, #24, #25, #22, #23, #26, #27, #28, #29
