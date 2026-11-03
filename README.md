# Hoppin

A shared group-trip planner: one place for the itinerary, bookings, documents, expenses, polls, weather and maps, available offline. Web first, iOS and Android later.

- Design: [docs/superpowers/specs/2026-11-03-tripapp-design.md](docs/superpowers/specs/2026-11-03-tripapp-design.md)
- Build plan: [docs/superpowers/plans/2026-11-03-tripapp.md](docs/superpowers/plans/2026-11-03-tripapp.md)
- **New here? Start with [docs/status.md](docs/status.md)** (what is done, where to start, how to avoid conflicts)
- Which issue to pick next: [docs/work-plan.md](docs/work-plan.md)
- Work is split into phases (GitHub milestones) and issues. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Try it
```
npm install
npm run demo        # the whole app on sample data: no accounts, no email, no network. Open http://localhost:5173
npm run dev         # the real app against your Supabase project (needs apps/web/.env.local, see docs/deploy.md)
npm test            # all tests
```
In demo mode you are signed in as the organizer of a sample trip (Goa) and a plain member of another (Manali weekend). Everything is clickable: add plans, say "I'm in", approve the person waiting to join, create an invite link, create a trip. Reloading the page resets it.

Status: the core app works end to end, including offline. See docs/status.md.
