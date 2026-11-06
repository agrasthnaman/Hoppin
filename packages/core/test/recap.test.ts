import { describe, expect, it } from "vitest";
import { distanceKm } from "../src/place";
import { dayRecap, shareText, tripRecap } from "../src/recap";
import type { Item, MemberInfo } from "../src/types";

const TZ = "Asia/Makassar";
const at = (hhmm: string, day: string) => new Date(`2027-03-${day}T${hhmm}:00+08:00`).toISOString();
const uluwatu = { lat: -8.8291, lon: 115.0849, label: "Uluwatu Temple" };
const ubud = { lat: -8.5069, lon: 115.2625, label: "Ubud" };
const tegal = { lat: -8.4312, lon: 115.2793, label: "Tegallalang" };

function plan(over: Partial<Item> & Pick<Item, "id" | "title" | "startsAt">): Item {
  return {
    tripId: "t1",
    ownerId: "asha",
    kind: "activity",
    visibility: "shared",
    groupItem: true,
    endsAt: null,
    tz: TZ,
    locationUrl: null,
    details: { place: uluwatu },
    version: 1,
    ...over,
  };
}

const member = (userId: string, displayName: string, status: MemberInfo["status"] = "approved"): MemberInfo => ({
  userId,
  displayName,
  status,
  role: "member",
  canEditAll: false,
});

const items: Item[] = [
  plan({ id: "a", title: "Uluwatu Temple", startsAt: at("17:00", "28") }),
  plan({ id: "b", title: "Ubud Market", startsAt: at("10:00", "30"), details: { place: ubud } }),
  plan({ id: "c", title: "Tegallalang Rice Terraces", startsAt: at("07:30", "30"), details: { place: tegal } }),
  plan({ id: "d", title: "Uluwatu again", startsAt: at("18:00", "30"), details: { place: uluwatu } }),
  plan({ id: "secret", title: "Secret spa", startsAt: at("12:00", "30"), visibility: "private", groupItem: false, details: { place: ubud } }),
  plan({ id: "opt", title: "Optional surf", startsAt: at("08:00", "29"), groupItem: false, details: { place: tegal } }),
  plan({ id: "loose", title: "No place yet", startsAt: at("09:00", "29"), details: {} }),
];

const members = [member("asha", "Asha Rao"), member("ravi", "Ravi"), member("meera", "Meera K"), member("gone", "Old Friend", "removed"), member("wait", "Pending", "pending")];

const input = { items, rsvps: [{ itemId: "b", userId: "ravi" }, { itemId: "b", userId: "meera" }, { itemId: "c", userId: "ravi" }], members, startDate: "2027-03-28", endDate: "2027-04-05", tz: TZ };

describe("tripRecap", () => {
  const recap = tripRecap(input);

  it("counts the days inclusively from the trip dates", () => {
    expect(recap.days).toBe(9);
    expect(recap.firstDay).toBe("2027-03-28");
    expect(recap.lastDay).toBe("2027-04-05");
  });

  it("uses only group plans: private and optional plans never appear, even for their owner", () => {
    const titles = recap.routes.flatMap((r) => r.stops.map((s) => s.title));
    expect(titles).not.toContain("Secret spa");
    expect(titles).not.toContain("Optional surf");
    expect(recap.topStops.map((s) => s.title)).not.toContain("Secret spa");
  });

  it("counts distinct places", () => {
    expect(recap.places).toBe(3);
  });

  it("adds up the distance between consecutive stops within each day", () => {
    const day30 = distanceKm(tegal, ubud) + distanceKm(ubud, uluwatu);
    expect(recap.distanceKm).toBe(Math.round(day30));
    expect(Math.round(distanceKm(tegal, ubud))).toBe(9);
  });

  it("lists approved members by first name only", () => {
    expect(recap.travellers).toEqual(["Asha", "Ravi", "Meera"]);
  });

  it("orders the top stops by how many are going, then by time", () => {
    expect(recap.topStops.map((s) => s.title)).toEqual(["Ubud Market", "Tegallalang Rice Terraces", "Uluwatu Temple"]);
  });

  it("hides the busiest day when no day has three plans", () => {
    expect(recap.busiest).toEqual({ date: "2027-03-30", plans: 3 });
    expect(tripRecap({ ...input, items: items.slice(0, 2) }).busiest).toBeNull();
  });

  it("uses the plans' dates when the trip has none", () => {
    const undated = tripRecap({ ...input, startDate: null, endDate: null });
    expect(undated.firstDay).toBe("2027-03-28");
    expect(undated.lastDay).toBe("2027-03-30");
    expect(undated.days).toBe(3);
  });

  it("gives zeros for an empty trip", () => {
    const empty = tripRecap({ ...input, items: [], startDate: null, endDate: null });
    expect(empty).toMatchObject({ days: 0, places: 0, distanceKm: 0, routes: [], topStops: [], busiest: null });
  });
});

describe("dayRecap", () => {
  it("gives that day's stops in order with their local times", () => {
    const day = dayRecap(input, "2027-03-30");
    expect(day.stops).toEqual([
      { order: 1, title: "Tegallalang Rice Terraces", time: "07:30" },
      { order: 2, title: "Ubud Market", time: "10:00" },
      { order: 3, title: "Uluwatu again", time: "18:00" },
    ]);
    expect(day.plans).toBe(3);
    expect(day.routes).toHaveLength(1);
  });
});

describe("shareText", () => {
  it("is one friendly line with the address", () => {
    expect(shareText(tripRecap(input), "Bali Bros")).toBe(`Bali Bros: 9 days, 3 places, ${tripRecap(input).distanceKm} km. Planned with Hoppin hoppinclub.com`);
  });
});
