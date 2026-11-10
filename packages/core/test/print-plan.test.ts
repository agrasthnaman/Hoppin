import { describe, expect, it } from "vitest";
import { buildPrintPlan, stayNote, tripZones, zoneLabel, type PrintOptions } from "../src/print-plan";
import type { Item, TripSnapshot } from "../src/types";

const TZ = "Asia/Makassar";
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+08:00`).toISOString();
function plan(over: Partial<Item> & Pick<Item, "id" | "title" | "startsAt">): Item {
  return { tripId: "t1", ownerId: "me", kind: "activity", visibility: "shared", groupItem: true, endsAt: null, tz: TZ, locationUrl: null, details: {}, version: 1, ...over };
}

const villa = plan({ id: "villa", kind: "stay", title: "Ubud Villa", startsAt: at("2026-03-28", "14:00"), endsAt: at("2026-03-31", "11:00") });
const flight = plan({
  id: "fl",
  kind: "flight",
  title: "DEL to DPS",
  startsAt: "2026-03-28T04:15:00Z",
  endsAt: "2026-03-28T09:30:00Z",
  tz: "Asia/Kolkata",
  endTz: TZ,
});
const temple = plan({
  id: "temple",
  title: "Temple visit",
  startsAt: at("2026-03-29", "09:00"),
  endsAt: at("2026-03-29", "11:00"),
  locationUrl: "https://maps.example/t",
  details: { notes: "Sarong needed. Ref ZX9", place: { lat: -8.5, lon: 115.3, label: "Tirta Empul" } },
});
const rafting = plan({ id: "raft", title: "Rafting", groupItem: false, ownerId: "riya", startsAt: at("2026-03-29", "13:00") });
const cooking = plan({ id: "cook", title: "Cooking class", groupItem: false, ownerId: "riya", startsAt: at("2026-03-29", "15:00") });
const mine = plan({ id: "spa", title: "My spa", visibility: "private", startsAt: at("2026-03-29", "17:00") });
const theirs = plan({ id: "secret", title: "Riya's surprise", visibility: "private", ownerId: "riya", startsAt: at("2026-03-29", "18:00") });

const trip: TripSnapshot = {
  trip: { id: "t1", name: "Bali", startDate: "2026-03-28", endDate: "2026-03-31", destination: { name: "Bali, Indonesia", lat: -8.4, lon: 115.2 } },
  members: [
    { userId: "me", role: "organizer", status: "approved", canEditAll: false, displayName: "Aman Gupta" },
    { userId: "riya", role: "member", status: "approved", canEditAll: false, displayName: "Riya" },
    { userId: "pending", role: "member", status: "pending", canEditAll: false, displayName: "Waiting Person" },
  ],
  items: [temple, villa, flight, rafting, cooking, mine, theirs],
  rsvps: [{ itemId: "raft", userId: "me" }],
  documents: [],
};
const opts = (over: Partial<PrintOptions> = {}): PrintOptions => ({ viewerId: "me", includeNotes: false, includeOptional: true, printedAt: Date.parse("2026-11-12T06:00:00Z"), deviceTz: "Asia/Kolkata", ...over });

describe("buildPrintPlan", () => {
  it("has the trip's header: name, dates, destination, printed date and travellers' first names", () => {
    expect(buildPrintPlan(trip, opts()).header).toMatchObject({
      name: "Bali",
      startDate: "2026-03-28",
      endDate: "2026-03-31",
      destination: "Bali, Indonesia",
      printed: "Printed 12 Nov 2026",
      travellers: ["Aman", "Riya"],
    });
  });

  it("groups plans by trip day in time order, with the stay pinned first", () => {
    const days = buildPrintPlan(trip, opts()).days;
    expect(days.map((d) => d.heading)).toEqual(["Day 1 · Sat 28 Mar 2026", "Day 2 · Sun 29 Mar 2026", "Day 3 · Mon 30 Mar 2026", "Day 4 · Tue 31 Mar 2026"]);
    expect(days[0]!.stays).toEqual(["Staying: Ubud Villa, check-in 14:00"]);
    expect(days[1]!.stays).toEqual(["Staying: Ubud Villa, night 2 of 3"]);
    expect(days[3]!.stays).toEqual(["Staying: Ubud Villa, check-out 11:00"]);
    expect(days[0]!.plans.map((p) => p.title)).toEqual(["DEL to DPS"]);
    expect(days[1]!.plans.map((p) => p.title)).toEqual(["Temple visit", "Rafting", "My spa"]);
    expect(days[2]!.plans).toEqual([]);
  });

  it("shows each plan's kind, time in its own zone (marked local when it differs), place and map link as text", () => {
    const days = buildPrintPlan(trip, opts()).days;
    expect(days[0]!.plans[0]).toMatchObject({ kind: "Flight", time: "09:45 – 17:30 (local)" });
    expect(days[1]!.plans[0]).toEqual({ id: "temple", kind: "Activity", time: "09:00 – 11:00", title: "Temple visit", place: "Tirta Empul", link: "https://maps.example/t", notes: null });
  });

  it("includes notes only when asked", () => {
    expect(buildPrintPlan(trip, opts({ includeNotes: true })).days[1]!.plans[0]!.notes).toBe("Sarong needed. Ref ZX9");
  });

  it("leaves out optional plans when asked, and never shows unjoined ones or other people's private plans", () => {
    const all = buildPrintPlan(trip, opts()).days.flatMap((d) => d.plans.map((p) => p.title));
    expect(all).not.toContain("Cooking class");
    expect(all).not.toContain("Riya's surprise");
    const noOptional = buildPrintPlan(trip, opts({ includeOptional: false })).days.flatMap((d) => d.plans.map((p) => p.title));
    expect(noOptional).not.toContain("Rafting");
  });

  it("stays inside the trip's days when a plan is dated outside them", () => {
    const stray = plan({ id: "stray", title: "Poll winner", startsAt: at("2027-06-01", "10:00"), details: { pollId: "p1" } });
    const days = buildPrintPlan({ ...trip, items: [...trip.items, stray] }, opts()).days;
    expect(days.map((d) => d.date)).toEqual(["2026-03-28", "2026-03-29", "2026-03-30", "2026-03-31"]);
    expect(days.flatMap((d) => d.plans.map((p) => p.title))).not.toContain("Poll winner");
  });

  it("covers plans outside the trip's dates, and a trip with no dates", () => {
    const early = plan({ id: "early", title: "Visa run", startsAt: at("2026-03-26", "10:00") });
    const days = buildPrintPlan({ ...trip, trip: { ...trip.trip, startDate: null, endDate: null }, items: [early, temple] }, opts()).days;
    expect(days.map((d) => d.heading)).toEqual(["Day 1 · Thu 26 Mar 2026", "Day 2 · Fri 27 Mar 2026", "Day 3 · Sat 28 Mar 2026", "Day 4 · Sun 29 Mar 2026"]);
  });
});

describe("time zone", () => {
  it("by default says the trip's own zone is used, and marks plans in another zone as local", () => {
    const plan = buildPrintPlan(trip, opts());
    expect(plan.header.zone).toEqual({ tz: TZ, label: "Makassar · GMT+8", chosen: false });
  });

  it("shows every time in a chosen zone, groups days by it, and drops the local mark", () => {
    const plan = buildPrintPlan(trip, opts({ displayTz: "Asia/Kolkata" }));
    expect(plan.header.zone).toEqual({ tz: "Asia/Kolkata", label: "Kolkata · GMT+5:30", chosen: true });
    expect(plan.days[0]!.plans[0]).toMatchObject({ title: "DEL to DPS", time: "09:45 – 15:00" });
    expect(plan.days[1]!.plans[0]).toMatchObject({ title: "Temple visit", time: "06:30 – 08:30" });
  });

  it("a plan can move to another day in the chosen zone", () => {
    const late = plan({ id: "late", title: "Night market", startsAt: at("2026-03-29", "23:30") });
    const days = buildPrintPlan({ ...trip, items: [villa, late] }, opts({ displayTz: "Asia/Tokyo" })).days;
    expect(days.find((d) => d.plans.some((p) => p.id === "late"))!.date).toBe("2026-03-30");
  });

  it("names renamed zones by their current city", () => {
    expect(zoneLabel("Asia/Calcutta", Date.parse("2026-03-28T00:00:00Z"))).toBe("Kolkata · GMT+5:30");
    expect(zoneLabel("America/New_York", Date.parse("2026-01-10T00:00:00Z"))).toBe("New York · GMT-5");
  });

  it("ignores a zone that does not exist", () => {
    expect(buildPrintPlan(trip, opts({ displayTz: "Mars/Olympus" })).header.zone).toMatchObject({ tz: TZ, chosen: false });
  });

  it("offers the zones of the plans shown, the trip's own first, never those of other people's private plans", () => {
    expect(tripZones(trip.items)).toEqual([TZ, "Asia/Kolkata"]);
    const hidden = plan({ id: "h", title: "Hidden", visibility: "private", ownerId: "riya", tz: "Europe/Paris", startsAt: at("2026-03-29", "10:00") });
    expect(buildPrintPlan({ ...trip, items: [...trip.items, hidden] }, opts()).zones).toEqual([TZ, "Asia/Kolkata"]);
  });
});

describe("stayNote", () => {
  it("says check-in, which night, or check-out", () => {
    expect(stayNote(villa, "2026-03-28")).toBe("Check-in 14:00");
    expect(stayNote(villa, "2026-03-30")).toBe("Night 3 of 3");
    expect(stayNote(villa, "2026-03-31")).toBe("Check-out 11:00");
  });
});
