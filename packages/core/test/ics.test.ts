import { describe, expect, it } from "vitest";
import { buildIcs, type IcsOptions } from "../src/ics";
import type { Item } from "../src/types";

function plan(over: Partial<Item> & Pick<Item, "id" | "title" | "startsAt">): Item {
  return { tripId: "t1", ownerId: "me", kind: "activity", visibility: "shared", groupItem: true, endsAt: null, tz: "Asia/Makassar", locationUrl: null, details: {}, version: 1, ...over };
}

// Delhi 09:45 (UTC+5:30) = 04:15Z; lands in Denpasar 17:30 (UTC+8, Asia/Makassar) = 09:30Z.
const flight = plan({ id: "fl", kind: "flight", title: "DEL to DPS", startsAt: "2026-03-28T04:15:00Z", endsAt: "2026-03-28T09:30:00Z", tz: "Asia/Kolkata", endTz: "Asia/Makassar", version: 3 });
// Check in 28 Mar 14:00, check out 31 Mar 11:00, Bali time: three nights, so the all-day event ends (exclusive) on the 31st.
const villa = plan({
  id: "villa",
  kind: "stay",
  title: "Ubud Villa",
  startsAt: "2026-03-28T06:00:00Z",
  endsAt: "2026-03-31T03:00:00Z",
  locationUrl: "https://maps.example/?q=1,2",
  details: { notes: "Booking ref AB12", place: { lat: -8.5, lon: 115.26, label: "Ubud Villa, Jl. Raya" } },
});
const options = (over: Partial<IcsOptions> = {}): IcsOptions => ({
  calendarName: "Bali",
  now: new Date("2026-11-06T07:20:00Z"),
  includePrivate: true,
  includeOptional: true,
  viewerId: "me",
  joined: new Set(),
  ...over,
});
const lines = (ics: string) => ics.split("\r\n");
const unfold = (ics: string) => ics.replace(/\r\n /g, "");

describe("buildIcs", () => {
  it("writes a complete calendar: UTC times for a flight across zones, an all-day stay with an exclusive end", () => {
    const ics = buildIcs([villa, flight], options());
    expect(ics).toBe(
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Hoppin//Trip planner//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:Bali",
        "BEGIN:VEVENT",
        "UID:fl@hoppinclub.com",
        "DTSTAMP:20261106T072000Z",
        "SEQUENCE:3",
        "DTSTART:20260328T041500Z",
        "DTEND:20260328T093000Z",
        "SUMMARY:Flight: DEL to DPS",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:villa@hoppinclub.com",
        "DTSTAMP:20261106T072000Z",
        "SEQUENCE:1",
        "DTSTART;VALUE=DATE:20260328",
        "DTEND;VALUE=DATE:20260331",
        "SUMMARY:Ubud Villa",
        "DESCRIPTION:Booking ref AB12\\nhttps://maps.example/?q=1\\,2",
        "LOCATION:Ubud Villa\\, Jl. Raya",
        "URL:https://maps.example/?q=1,2",
        "END:VEVENT",
        "END:VCALENDAR",
        "",
      ].join("\r\n"),
    );
  });

  it("uses CRLF line endings only", () => {
    const ics = buildIcs([villa, flight], options());
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("escapes commas, semicolons, backslashes and newlines in text, including the calendar name", () => {
    const odd = plan({ id: "odd", title: "a,b;c\\d", startsAt: "2026-03-29T01:00:00Z", details: { notes: "line1\nline2\r\nline3" } });
    const ics = buildIcs([odd], options({ calendarName: "Bali, 2026; trip" }));
    expect(lines(ics)).toContain("X-WR-CALNAME:Bali\\, 2026\\; trip");
    expect(lines(ics)).toContain("SUMMARY:a\\,b\\;c\\\\d");
    expect(lines(ics)).toContain("DESCRIPTION:line1\\nline2\\nline3");
  });

  it("folds long lines at 75 octets", () => {
    const long = plan({ id: "long", title: "a".repeat(200), startsAt: "2026-03-29T01:00:00Z" });
    const ics = buildIcs([long], options());
    for (const line of lines(ics)) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(lines(unfold(ics))).toContain(`SUMMARY:${"a".repeat(200)}`);
  });

  it("never splits a multi-byte character when folding", () => {
    const title = "नमस्ते बाली 🌴 ".repeat(8);
    const ics = buildIcs([plan({ id: "u", title, startsAt: "2026-03-29T01:00:00Z" })], options());
    for (const line of lines(ics)) {
      const bytes = new TextEncoder().encode(line);
      expect(bytes.length).toBeLessThanOrEqual(75);
      expect(new TextDecoder("utf-8", { fatal: true }).decode(bytes)).toBe(line); // throws on a broken character
    }
    expect(lines(unfold(ics))).toContain(`SUMMARY:${title}`);
  });

  it("keeps the same UID and uses the version as SEQUENCE, so importing again updates instead of duplicating", () => {
    const before = buildIcs([villa], options());
    const after = buildIcs([{ ...villa, title: "Ubud Villa (2 rooms)", version: 2 }], options());
    expect(lines(before)).toContain("UID:villa@hoppinclub.com");
    expect(lines(after)).toContain("UID:villa@hoppinclub.com");
    expect(lines(after)).toContain("SEQUENCE:2");
  });

  it("leaves out other people's private plans, and optional plans the viewer has not joined", () => {
    const theirs = plan({ id: "theirs", title: "Riya's secret", visibility: "private", ownerId: "riya", startsAt: "2026-03-29T01:00:00Z" });
    const mine = plan({ id: "mine", title: "My massage", visibility: "private", startsAt: "2026-03-29T02:00:00Z" });
    const joined = plan({ id: "joined", title: "Rafting", groupItem: false, ownerId: "riya", startsAt: "2026-03-29T03:00:00Z" });
    const skipped = plan({ id: "skipped", title: "Cooking class", groupItem: false, ownerId: "riya", startsAt: "2026-03-29T04:00:00Z" });
    const own = plan({ id: "own", title: "Sunset walk I suggested", groupItem: false, startsAt: "2026-03-29T05:00:00Z" });
    const all = [theirs, mine, joined, skipped, own];
    const uids = (o: Partial<IcsOptions>) => lines(buildIcs(all, options({ joined: new Set(["joined"]), ...o }))).filter((l) => l.startsWith("UID:"));
    expect(uids({})).toEqual(["UID:mine@hoppinclub.com", "UID:joined@hoppinclub.com", "UID:own@hoppinclub.com"]);
    expect(uids({ includePrivate: false })).toEqual(["UID:joined@hoppinclub.com", "UID:own@hoppinclub.com"]);
    expect(uids({ includeOptional: false })).toEqual(["UID:mine@hoppinclub.com"]);
  });

  it("makes a plan with no end an hour long", () => {
    const ics = buildIcs([plan({ id: "x", title: "Dinner", startsAt: "2026-03-29T11:00:00Z" })], options());
    expect(lines(ics)).toContain("DTSTART:20260329T110000Z");
    expect(lines(ics)).toContain("DTEND:20260329T120000Z");
  });

  it("gives a stay with no check-out, or one that ends the same day, a single day", () => {
    const ics = buildIcs([{ ...villa, endsAt: null }], options());
    expect(lines(ics)).toContain("DTSTART;VALUE=DATE:20260328");
    expect(lines(ics)).toContain("DTEND;VALUE=DATE:20260329");
  });

  it("is stable: sorted by start, then id", () => {
    const b = plan({ id: "b", title: "B", startsAt: "2026-03-29T01:00:00Z" });
    const a = plan({ id: "a", title: "A", startsAt: "2026-03-29T01:00:00Z" });
    const first = buildIcs([b, a, flight], options());
    expect(buildIcs([a, flight, b], options())).toBe(first);
    expect(lines(first).filter((l) => l.startsWith("UID:"))).toEqual(["UID:fl@hoppinclub.com", "UID:a@hoppinclub.com", "UID:b@hoppinclub.com"]);
  });
});
