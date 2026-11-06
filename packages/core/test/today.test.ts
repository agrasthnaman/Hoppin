import { describe, expect, it } from "vitest";
import { currentTripId, nowAndNext, planProgress, untilLabel } from "../src/today";
import type { Item } from "../src/types";

const ME = "me";
const FRIEND = "friend";

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
    tz: "Asia/Kolkata",
    locationUrl: null,
    details: {},
    version: 1,
    ...over,
  };
}

describe("nowAndNext", () => {
  it("returns current and next across a time-zone change", () => {
    // Leaves Delhi at 23:00 IST and lands in London at 04:30 GMT the next morning.
    const flight = item({
      title: "DEL to LHR",
      kind: "flight",
      startsAt: "2026-12-01T23:00:00+05:30",
      endsAt: "2026-12-02T04:30:00Z",
      tz: "Asia/Kolkata",
    });
    const breakfast = item({
      title: "Breakfast in London",
      startsAt: "2026-12-02T08:00:00Z",
      endsAt: "2026-12-02T09:00:00Z",
      tz: "Europe/London",
    });
    const during = nowAndNext([breakfast, flight], ME, new Date("2026-12-02T02:00:00Z"));
    expect(during.current?.title).toBe("DEL to LHR");
    expect(during.next?.title).toBe("Breakfast in London");

    const landed = nowAndNext([flight, breakfast], ME, new Date("2026-12-02T05:00:00Z"));
    expect(landed.current).toBeNull();
    expect(landed.next?.title).toBe("Breakfast in London");
  });

  it("ignores other members' private items", () => {
    const mine = item({
      title: "My plan",
      ownerId: ME,
      visibility: "private",
      groupItem: false,
      startsAt: "2026-12-02T04:00:00Z",
      endsAt: "2026-12-02T05:00:00Z",
    });
    const secret = item({
      title: "Secret",
      ownerId: FRIEND,
      visibility: "private",
      groupItem: false,
      startsAt: "2026-12-02T04:00:00Z",
      endsAt: "2026-12-02T05:00:00Z",
    });
    const later = item({ title: "Tour", startsAt: "2026-12-02T06:00:00Z", endsAt: "2026-12-02T07:00:00Z" });
    const result = nowAndNext([secret, later, mine], ME, new Date("2026-12-02T04:30:00Z"));
    expect(result.current?.title).toBe("My plan");
    expect(result.next?.title).toBe("Tour");
    expect(JSON.stringify(result)).not.toContain("Secret");
  });

  it("returns the active stay's address and map link", () => {
    const stay = item({
      title: "Beach Hotel",
      kind: "stay",
      startsAt: "2026-12-01T08:30:00Z",
      endsAt: "2026-12-04T05:30:00Z",
      locationUrl: "https://maps.example/hotel",
      details: { notes: "Calangute beach road" },
    });
    const tour = item({ title: "Old town tour", startsAt: "2026-12-02T04:30:00Z", endsAt: "2026-12-02T07:00:00Z" });
    const result = nowAndNext([stay, tour], ME, new Date("2026-12-02T05:00:00Z"));
    expect(result.current?.title).toBe("Old town tour");
    expect(result.stay?.title).toBe("Beach Hotel");
    expect(result.stay?.locationUrl).toBe("https://maps.example/hotel");
    expect(result.stay?.details.notes).toBe("Calangute beach road");
  });

  it("keeps the group plan as now when an optional plan overlaps it", () => {
    const tour = item({ title: "Old town tour", startsAt: "2026-12-02T04:30:00Z", endsAt: "2026-12-02T07:00:00Z" });
    const cafe = item({
      title: "Cafe crawl",
      groupItem: false,
      startsAt: "2026-12-02T06:00:00Z",
      endsAt: "2026-12-02T07:30:00Z",
    });
    const lunch = item({ title: "Lunch", startsAt: "2026-12-02T07:30:00Z", endsAt: "2026-12-02T09:00:00Z" });
    const result = nowAndNext([cafe, lunch, tour], ME, new Date("2026-12-02T06:30:00Z"));
    expect(result.current?.title).toBe("Old town tour");
    expect(result.next?.title).toBe("Lunch");
  });
});

describe("currentTripId", () => {
  it("picks the trip that contains today", () => {
    const trips = [
      { id: "later", startDate: "2026-12-20", endDate: "2026-12-22" },
      { id: "goa", startDate: "2026-11-30", endDate: "2026-12-04" },
    ];
    expect(currentTripId(trips, "2026-12-01")).toBe("goa");
    expect(currentTripId(trips, "2026-11-01")).toBeNull();
    expect(currentTripId([{ id: "open" }], "2026-12-01")).toBeNull();
  });
});

describe("untilLabel", () => {
  const min = 60_000;
  it("speaks in minutes, then hours, then days", () => {
    expect(untilLabel(10_000)).toBe("now");
    expect(untilLabel(25 * min)).toBe("in 25 min");
    expect(untilLabel(60 * min)).toBe("in 1 h");
    expect(untilLabel(130 * min)).toBe("in 2 h 10 min");
    expect(untilLabel(10 * 60 * min)).toBe("in 10 h");
    expect(untilLabel(72 * 60 * min)).toBe("in 3 days");
  });
});

describe("planProgress", () => {
  const plan = (startsAt: string, endsAt: string | null) => ({ startsAt, endsAt }) as Item;
  it("runs from 0 at the start to 1 at the end, and stays inside that range", () => {
    const p = plan("2026-12-01T10:00:00Z", "2026-12-01T12:00:00Z");
    expect(planProgress(p, Date.parse("2026-12-01T09:00:00Z"))).toBe(0);
    expect(planProgress(p, Date.parse("2026-12-01T11:00:00Z"))).toBe(0.5);
    expect(planProgress(p, Date.parse("2026-12-01T13:00:00Z"))).toBe(1);
  });
  it("treats a plan with no end as an hour long", () => {
    expect(planProgress(plan("2026-12-01T10:00:00Z", null), Date.parse("2026-12-01T10:30:00Z"))).toBe(0.5);
  });
});
