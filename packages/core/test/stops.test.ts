import { describe, expect, it } from "vitest";
import { dayStops, tripStops } from "../src/stops";
import type { Item } from "../src/types";

const TZ = "Asia/Kolkata";
const at = (hhmm: string, day = "02") => new Date(`2026-12-${day}T${hhmm}:00+05:30`).toISOString();
const pin = { lat: -8.8291, lon: 115.0849, label: "Uluwatu Temple" };

function plan(over: Partial<Item> & Pick<Item, "id" | "title" | "startsAt">): Item {
  return {
    tripId: "t1",
    ownerId: "me",
    kind: "activity",
    visibility: "shared",
    groupItem: true,
    endsAt: null,
    tz: TZ,
    locationUrl: null,
    details: { place: pin },
    version: 1,
    ...over,
  };
}

describe("dayStops", () => {
  const temple = plan({ id: "temple", title: "Uluwatu Temple", startsAt: at("17:00") });
  const lunch = plan({ id: "lunch", title: "Lunch", startsAt: at("13:00"), details: { place: { lat: -8.5, lon: 115.2, label: "Warung" } } });
  const untitled = plan({ id: "b", title: "Beach", startsAt: at("17:00"), details: { place: { lat: -8.7, lon: 115.1, label: "Beach" } } });
  const flight = plan({ id: "flight", title: "DEL to DPS", kind: "flight", startsAt: at("09:00"), details: {} });
  const placedFlight = plan({ id: "arrival", title: "Land in Bali", kind: "flight", startsAt: at("18:00") });
  const loose = plan({ id: "loose", title: "Somewhere", startsAt: at("11:00"), details: {} });
  const optional = plan({ id: "opt", title: "Seminar", startsAt: at("16:00"), groupItem: false });
  const mine = plan({ id: "mine", title: "Nap", startsAt: at("15:00"), visibility: "private", groupItem: false });
  const theirs = plan({ id: "theirs", title: "Secret", startsAt: at("15:00"), visibility: "private", groupItem: false, ownerId: "riya" });
  const stay = plan({
    id: "stay",
    title: "Villa",
    kind: "stay",
    startsAt: at("15:00", "02"),
    endsAt: at("11:00", "04"),
    details: { place: { lat: -8.4, lon: 115.3, label: "Villa" } },
  });
  const homeless = plan({ id: "hotel", title: "Hotel", kind: "stay", startsAt: at("15:00"), details: {} });

  const items = [temple, lunch, untitled, flight, placedFlight, loose, optional, mine, theirs, stay, homeless];

  it("numbers placed plans, keeps stays off the list, and skips flights and unjoined optional plans", () => {
    const day = dayStops(items, "me", new Set(["opt"]), "2026-12-02", TZ);
    expect(day.stops.map((stop) => [stop.order, stop.itemId])).toEqual([
      [1, "lunch"],
      [2, "mine"],
      [3, "opt"],
      [4, "b"],
      [5, "temple"],
      [6, "arrival"],
    ]);
    expect(day.stays.map((stop) => stop.itemId)).toEqual(["stay"]);
    expect(day.stays[0]?.order).toBe(0);
    expect(day.unplaced.map((item) => item.id)).toEqual(["loose", "hotel"]);
    expect(day.stops.concat(day.stays).map((stop) => stop.itemId)).not.toContain("flight");
    expect(day.unplaced.map((item) => item.id)).not.toContain("flight");
    expect(day.stops.map((stop) => stop.itemId)).not.toContain("theirs");
  });

  it("leaves an optional plan out until the viewer joins it", () => {
    const day = dayStops(items, "me", new Set(), "2026-12-02", TZ);
    expect(day.stops.map((stop) => stop.itemId)).not.toContain("opt");
    expect(day.unplaced.map((item) => item.id)).not.toContain("opt");
  });

  it("reads a place from a map link when none was saved", () => {
    const linked = plan({
      id: "link",
      title: "Temple",
      startsAt: at("17:00"),
      details: {},
      locationUrl: "https://www.google.com/maps/place/Uluwatu+Temple/@-8.8291,115.0849,17z",
    });
    const day = dayStops([linked], "me", new Set(), "2026-12-02", TZ);
    expect(day.stops[0]?.place).toMatchObject({ lat: -8.8291, lon: 115.0849, label: "Uluwatu Temple" });
  });
});

describe("tripStops", () => {
  it("covers every trip day, including days with nothing on them", () => {
    const dinner = plan({ id: "dinner", title: "Dinner", startsAt: at("19:00", "03") });
    const days = tripStops([dinner], "me", new Set(), "2026-12-01", "2026-12-03", TZ);
    expect(days.map((day) => day.date)).toEqual(["2026-12-01", "2026-12-02", "2026-12-03"]);
    expect(days[2]?.stops.map((stop) => stop.itemId)).toEqual(["dinner"]);
    expect(days[0]?.stops).toEqual([]);
  });

  it("uses the days the plans cover when the trip has no dates", () => {
    const first = plan({ id: "a", title: "A", startsAt: at("10:00", "02") });
    const last = plan({ id: "b", title: "B", startsAt: at("10:00", "04"), details: {} });
    const days = tripStops([first, last], "me", new Set(), null, null, TZ);
    expect(days.map((day) => day.date)).toEqual(["2026-12-02", "2026-12-03", "2026-12-04"]);
  });
});
