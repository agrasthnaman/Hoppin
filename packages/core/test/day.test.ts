import { describe, expect, it } from "vitest";
import { buildDay, UNANCHORED } from "../src/day";
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

describe("buildDay: chips", () => {
  const tour = item({ title: "Old town tour", startsAt: at("10:00"), endsAt: at("12:00") });
  const lunch = item({ title: "Lunch", startsAt: at("13:00"), endsAt: at("14:00") });
  const optional = (title: string, hhmm: string, over: Partial<Item> = {}) =>
    item({ title, startsAt: at(hhmm), groupItem: false, ...over });
  const hotel = () =>
    item({ title: "Hotel", kind: "stay", startsAt: "2026-11-30T14:00:00+05:30", endsAt: "2026-12-03T11:00:00+05:30" });

  it("shared optional items become chips keyed to the block they overlap", () => {
    const museum = optional("Museum", "10:30");
    const day = buildDay([tour, lunch, museum], ME, "2026-12-01", IST);
    expect(day.chips[tour.id]?.map((c) => c.title)).toEqual(["Museum"]);
    expect(day.chips[lunch.id]).toBeUndefined();
    expect(day.blocks.map((b) => b.id)).not.toContain(museum.id);
  });

  it("a chip with no overlapping block attaches to the nearest earlier block", () => {
    const cafe = optional("Cafe crawl", "12:30");
    const day = buildDay([tour, lunch, cafe], ME, "2026-12-01", IST);
    expect(day.chips[tour.id]?.map((c) => c.title)).toEqual(["Cafe crawl"]);
  });

  it("a chip before the first block attaches to the first block", () => {
    const early = optional("Sunrise walk", "06:00");
    const day = buildDay([tour, lunch, early], ME, "2026-12-01", IST);
    expect(day.chips[tour.id]?.map((c) => c.title)).toEqual(["Sunrise walk"]);
  });

  it("with no blocks that day, chips are listed under the unanchored key", () => {
    const day = buildDay([optional("Walk", "10:00")], ME, "2026-12-01", IST);
    expect(day.chips[UNANCHORED]?.map((c) => c.title)).toEqual(["Walk"]);
  });

  it("a whole-day stay does not swallow the chips", () => {
    const stay = hotel();
    const day = buildDay([stay, tour, optional("Museum", "10:30")], ME, "2026-12-01", IST);
    expect(day.chips[tour.id]?.map((c) => c.title)).toEqual(["Museum"]);
    expect(day.chips[stay.id]).toBeUndefined();
  });

  it("when only a stay is there, chips attach to the stay", () => {
    const stay = hotel();
    const day = buildDay([stay, optional("Museum", "10:30")], ME, "2026-12-01", IST);
    expect(day.chips[stay.id]?.map((c) => c.title)).toEqual(["Museum"]);
  });

  it("orders chips in a slot by start time", () => {
    const day = buildDay([tour, optional("B", "11:00"), optional("A", "10:15")], ME, "2026-12-01", IST);
    expect(day.chips[tour.id]?.map((c) => c.title)).toEqual(["A", "B"]);
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
