import { describe, expect, it } from "vitest";
import { buildDay, nextBlock, UNANCHORED } from "../src/day";
import type { Item } from "../src/types";

const ME = "me";
const FRIEND = "friend";
const IST = "Asia/Kolkata";

let n = 0;
function item(over: Partial<Item> & Pick<Item, "startsAt" | "title">): Item {
  n += 1;
  return {
    id: `i${n}`,
    tripId: "t1",
    ownerId: FRIEND,
    kind: "activity",
    visibility: "shared",
    groupItem: true,
    endsAt: null,
    tz: IST,
    locationUrl: null,
    details: {},
    version: 1,
    ...over,
  };
}

/** An ISO instant for a wall-clock time in India on 1 Dec 2026 (10:00 IST is 04:30Z). */
const at = (hhmm: string) => new Date(`2026-12-01T${hhmm}:00+05:30`).toISOString();

describe("buildDay: blocks", () => {
  it("group items become blocks in time order", () => {
    const lunch = item({ title: "Lunch", startsAt: at("13:00"), endsAt: at("14:00") });
    const tour = item({ title: "Old town tour", startsAt: at("10:00"), endsAt: at("12:00") });
    const day = buildDay([lunch, tour], ME, "2026-12-01", IST);
    expect(day.blocks.map((b) => b.title)).toEqual(["Old town tour", "Lunch"]);
  });

  it("leaves out other days, including an item that starts exactly at midnight of the next day", () => {
    const today = item({ title: "Today", startsAt: at("09:00"), endsAt: at("10:00") });
    const tomorrow = item({ title: "Tomorrow", startsAt: "2026-12-02T00:00:00+05:30", endsAt: "2026-12-02T01:00:00+05:30" });
    const yesterday = item({ title: "Yesterday", startsAt: "2026-11-30T09:00:00+05:30", endsAt: "2026-11-30T10:00:00+05:30" });
    expect(buildDay([today, tomorrow, yesterday], ME, "2026-12-01", IST).blocks.map((b) => b.title)).toEqual(["Today"]);
  });

  it("shows a multi-day stay on each day it covers, once per day", () => {
    const stay = item({ title: "Beach hotel", kind: "stay", startsAt: "2026-11-30T14:00:00+05:30", endsAt: "2026-12-03T11:00:00+05:30" });
    for (const date of ["2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03"]) {
      expect(buildDay([stay], ME, date, IST).blocks, date).toHaveLength(1);
    }
    expect(buildDay([stay], ME, "2026-12-04", IST).blocks).toHaveLength(0);
  });

  it("a flight that lands the next day appears on both days it touches, once on each", () => {
    // Depart Delhi 23:00 IST on 1 Dec, land London 04:30 GMT on 2 Dec (10:00 IST).
    const flight = item({
      title: "DEL to LHR",
      kind: "flight",
      startsAt: "2026-12-01T23:00:00+05:30",
      endsAt: "2026-12-02T04:30:00Z",
    });
    expect(buildDay([flight, flight], ME, "2026-12-01", IST).blocks).toHaveLength(1);
    expect(buildDay([flight], ME, "2026-12-02", IST).blocks).toHaveLength(1);
    expect(buildDay([flight], ME, "2026-12-02", "Europe/London").blocks).toHaveLength(1);
    expect(buildDay([flight], ME, "2026-12-03", IST).blocks).toHaveLength(0);
  });

  it("puts the same item on different days for viewers in different time zones", () => {
    const late = item({ title: "Late dinner", startsAt: "2026-12-01T20:00:00Z", endsAt: "2026-12-01T21:00:00Z" });
    expect(buildDay([late], ME, "2026-12-01", "UTC").blocks).toHaveLength(1);
    expect(buildDay([late], ME, "2026-12-01", IST).blocks).toHaveLength(0);
    expect(buildDay([late], ME, "2026-12-02", IST).blocks).toHaveLength(1);
  });
});

describe("buildDay: optional plans", () => {
  const tour = item({ title: "Old town tour", startsAt: at("10:00"), endsAt: at("12:00") });
  const lunch = item({ title: "Lunch", startsAt: at("13:00"), endsAt: at("14:00") });
  const flight = item({ title: "DEL to GOI", kind: "flight", startsAt: at("08:00"), endsAt: at("11:00") });
  const optional = (title: string, hhmm: string, over: Partial<Item> = {}) =>
    item({ title, startsAt: at(hhmm), groupItem: false, ...over });
  const hotel = () =>
    item({ title: "Hotel", kind: "stay", startsAt: "2026-11-30T14:00:00+05:30", endsAt: "2026-12-03T11:00:00+05:30" });

  it("keeps an optional plan on its own, even when it starts during a flight", () => {
    const seminar = optional("Visit KYND seminak", "09:30");
    const day = buildDay([flight, seminar], ME, "2026-12-01", IST);
    expect(day.blocks.map((b) => b.title)).toEqual(["DEL to GOI"]);
    expect(day.chips[flight.id]).toBeUndefined();
    expect(day.chips[UNANCHORED]?.map((c) => c.title)).toEqual(["Visit KYND seminak"]);
  });

  it("does not tuck an optional plan under an earlier booking", () => {
    const cafe = optional("Cafe crawl", "12:30");
    const early = optional("Sunrise walk", "06:00");
    const day = buildDay([tour, lunch, cafe, early], ME, "2026-12-01", IST);
    expect(day.chips[tour.id]).toBeUndefined();
    expect(day.chips[lunch.id]).toBeUndefined();
    expect(day.chips[UNANCHORED]?.map((c) => c.title)).toEqual(["Sunrise walk", "Cafe crawl"]);
  });

  it("lists optional plans on their own when the day has only a stay", () => {
    const stay = hotel();
    const day = buildDay([stay, optional("Museum", "10:30")], ME, "2026-12-01", IST);
    expect(day.chips[stay.id]).toBeUndefined();
    expect(day.chips[UNANCHORED]?.map((c) => c.title)).toEqual(["Museum"]);
  });

  it("orders optional plans by start time", () => {
    const day = buildDay([optional("B", "11:00"), optional("A", "10:15")], ME, "2026-12-01", IST);
    expect(day.chips[UNANCHORED]?.map((c) => c.title)).toEqual(["A", "B"]);
  });
});

describe("buildDay: private lines", () => {
  it("private items appear only for their owner", () => {
    const mine = item({ title: "ABC place", startsAt: at("15:00"), groupItem: false, visibility: "private", ownerId: ME });
    const theirs = item({ title: "Secret", startsAt: at("16:00"), groupItem: false, visibility: "private", ownerId: FRIEND });
    const day = buildDay([mine, theirs], ME, "2026-12-01", IST);
    expect(day.privateLines.map((p) => p.title)).toEqual(["ABC place"]);
    expect(day.blocks).toEqual([]);
    expect(Object.values(day.chips).flat()).toEqual([]);
    expect(buildDay([mine, theirs], FRIEND, "2026-12-01", IST).privateLines.map((p) => p.title)).toEqual(["Secret"]);
  });
});

describe("nextBlock", () => {
  const T = (hhmm: string) => new Date(`2026-12-01T${hhmm}:00+05:30`).getTime();
  const b = (title: string, start: string, end: string | null, over: Partial<Item> = {}) =>
    item({ title, startsAt: at(start), endsAt: end ? at(end) : null, ...over });

  it("is the plan happening now, or else the next one to start", () => {
    const tour = b("Tour", "10:00", "12:00");
    const lunch = b("Lunch", "13:00", "14:00");
    expect(nextBlock([lunch, tour], T("11:00"))).toBe(tour.id); // running now
    expect(nextBlock([lunch, tour], T("12:30"))).toBe(lunch.id); // next up
  });

  it("is nothing once everything is over", () => {
    expect(nextBlock([b("Tour", "10:00", "12:00")], T("18:00"))).toBeNull();
  });

  it("does not let a multi-day stay take the spotlight", () => {
    const stay = item({ title: "Hotel", kind: "stay", startsAt: "2026-11-30T14:00:00+05:30", endsAt: "2026-12-03T11:00:00+05:30" });
    const tour = b("Tour", "10:00", "12:00");
    expect(nextBlock([stay, tour], T("09:00"))).toBe(tour.id);
    expect(nextBlock([stay], T("09:00"))).toBe(stay.id); // unless it is all there is
  });

  it("treats a plan with no end time as one hour long", () => {
    const walk = b("Walk", "10:00", null);
    expect(nextBlock([walk], T("10:30"))).toBe(walk.id);
    expect(nextBlock([walk], T("11:30"))).toBeNull();
  });
});
