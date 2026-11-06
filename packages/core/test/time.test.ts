import { describe, expect, it } from "vitest";
import { addDays, dayRange, defaultDay, formatTime, formatTimeRange, instantToZonedInput, localDate, planZone, zonedTimeToInstant } from "../src/time";

describe("dayRange", () => {
  it("returns the instants a calendar day starts and ends in a time zone", () => {
    const r = dayRange("2026-12-01", "Asia/Kolkata");
    expect(new Date(r.start).toISOString()).toBe("2026-11-30T18:30:00.000Z");
    expect(new Date(r.end).toISOString()).toBe("2026-12-01T18:30:00.000Z");
  });

  it("handles a daylight-saving day that is 23 hours long", () => {
    const r = dayRange("2026-03-08", "America/New_York");
    expect(new Date(r.start).toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(new Date(r.end).toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });

  it("works for UTC", () => {
    const r = dayRange("2026-12-01", "UTC");
    expect(r.end - r.start).toBe(24 * 3600 * 1000);
  });
});

describe("addDays", () => {
  it("moves across month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("formatTime", () => {
  it("shows 24-hour local time in the given zone", () => {
    expect(formatTime("2026-12-01T04:30:00Z", "Asia/Kolkata")).toBe("10:00");
    expect(formatTime("2026-12-01T04:30:00Z", "UTC")).toBe("04:30");
  });
});

describe("zonedTimeToInstant and instantToZonedInput", () => {
  it("turns a wall-clock time in a zone into the right instant, and back", () => {
    expect(zonedTimeToInstant("2026-12-01T10:00", "Asia/Kolkata")).toBe("2026-12-01T04:30:00.000Z");
    expect(instantToZonedInput("2026-12-01T04:30:00.000Z", "Asia/Kolkata")).toBe("2026-12-01T10:00");
  });

  it("handles daylight saving", () => {
    expect(zonedTimeToInstant("2026-07-01T09:00", "Europe/London")).toBe("2026-07-01T08:00:00.000Z");
    expect(zonedTimeToInstant("2026-12-01T09:00", "Europe/London")).toBe("2026-12-01T09:00:00.000Z");
  });

  it("round-trips across the whole day including near midnight", () => {
    for (const hhmm of ["00:00", "00:30", "23:59", "12:00"]) {
      const input = `2026-03-08T${hhmm}`;
      expect(instantToZonedInput(zonedTimeToInstant(input, "America/New_York"), "America/New_York")).toBe(input);
    }
  });
});

describe("localDate and defaultDay", () => {
  const NOW = Date.UTC(2026, 11, 3, 20, 0, 0); // 3 Dec 20:00 UTC = 4 Dec 01:30 in Kolkata

  it("gives the calendar date in a time zone", () => {
    expect(localDate(NOW, "UTC")).toBe("2026-12-03");
    expect(localDate(NOW, "Asia/Kolkata")).toBe("2026-12-04");
  });

  it("opens on today when it is within the trip, otherwise on the first day", () => {
    const trip = { startDate: "2026-12-01", endDate: "2026-12-05" };
    expect(defaultDay(trip, NOW, "UTC")).toBe("2026-12-03");
    expect(defaultDay(trip, Date.UTC(2026, 10, 1), "UTC")).toBe("2026-12-01"); // before
    expect(defaultDay(trip, Date.UTC(2027, 0, 1), "UTC")).toBe("2026-12-01"); // after
  });

  it("handles trips with missing dates", () => {
    expect(defaultDay({ startDate: null, endDate: null }, NOW, "UTC")).toBe("2026-12-03");
    expect(defaultDay({ startDate: "2026-12-10", endDate: null }, NOW, "UTC")).toBe("2026-12-10");
    expect(defaultDay({ startDate: null, endDate: "2026-12-01" }, NOW, "UTC")).toBe("2026-12-03");
  });
});

describe("formatTimeRange", () => {
  const range = (a: string, b: string | null, tz = "Asia/Kolkata") => formatTimeRange(a, b, tz);

  it("shows just the clock times when it starts and ends on the same day", () => {
    expect(range("2026-12-01T04:30:00.000Z", "2026-12-01T07:00:00.000Z")).toBe("10:00 – 12:30");
    expect(range("2026-12-01T04:30:00.000Z", null)).toBe("10:00");
  });

  it("adds the end date when it ends on a later day, so a stay does not look like it ends before it starts", () => {
    expect(range("2026-12-01T08:30:00.000Z", "2026-12-05T05:30:00.000Z")).toBe("14:00 – 5 Dec 11:00");
  });

  it("goes by the days in the given time zone", () => {
    // 23:00 on 1 Dec in India ends 03:00 on 2 Dec in India: a different day there
    expect(range("2026-12-01T17:30:00.000Z", "2026-12-01T21:30:00.000Z")).toBe("23:00 – 2 Dec 03:00");
  });
});

describe("formatTimeRange across time zones", () => {
  // Delhi 23:00 IST on 1 Dec is 17:30 UTC; the plane lands 04:30 GMT on 2 Dec.
  const depart = zonedTimeToInstant("2026-12-01T23:00", "Asia/Kolkata");
  const land = zonedTimeToInstant("2026-12-02T04:30", "Europe/London");

  it("shows departure in the first zone and arrival in the arrival zone", () => {
    expect(formatTimeRange(depart, land, "Asia/Kolkata", "Europe/London")).toBe("23:00 – 2 Dec 04:30");
  });

  it("without an arrival zone the old behaviour is kept (arrival shown in the departure zone)", () => {
    expect(formatTimeRange(depart, land, "Asia/Kolkata")).toBe("23:00 – 2 Dec 10:00");
    expect(formatTimeRange(depart, land, "Asia/Kolkata", null)).toBe("23:00 – 2 Dec 10:00");
  });

  it("a flight that lands the same calendar day shows no date", () => {
    const early = zonedTimeToInstant("2026-12-02T01:00", "Asia/Kolkata");
    expect(formatTimeRange(early, land, "Asia/Kolkata", "Europe/London")).toBe("01:00 – 04:30");
  });

  it("round-trips across a daylight-saving change in the arrival zone", () => {
    // London clocks go forward on 29 Mar 2026: 01:30 GMT does not exist, 02:30 BST is 01:30 UTC.
    const before = zonedTimeToInstant("2026-03-28T22:00", "Asia/Kolkata");
    const after = zonedTimeToInstant("2026-03-29T06:00", "Europe/London");
    expect(instantToZonedInput(after, "Europe/London")).toBe("2026-03-29T06:00");
    expect(formatTimeRange(before, after, "Asia/Kolkata", "Europe/London")).toBe("22:00 – 29 Mar 06:00");
    expect(Date.parse(after)).toBeGreaterThan(Date.parse(before));
  });
});

describe("planZone", () => {
  const bali = (id: string, startsAt: string) => ({ kind: "activity", startsAt, tz: "Asia/Makassar", id });
  it("uses the zone of the plans on that day, not the phone's", () => {
    expect(planZone([bali("a", "2027-03-30T01:00:00Z")], "2027-03-30", "Asia/Kolkata")).toBe("Asia/Makassar");
  });
  it("falls back to the rest of the trip for a day with no plans yet", () => {
    expect(planZone([bali("a", "2027-03-30T01:00:00Z")], "2027-04-02", "Asia/Kolkata")).toBe("Asia/Makassar");
  });
  it("ignores flights and uses the phone's zone when there is nothing else", () => {
    expect(planZone([{ kind: "flight", startsAt: "2027-03-30T01:00:00Z", tz: "Asia/Kolkata" }], "2027-03-30", "Europe/London")).toBe("Europe/London");
    expect(planZone([], "2027-03-30", "Europe/London")).toBe("Europe/London");
  });
  it("takes the most common zone when a day mixes zones", () => {
    const items = [bali("a", "2027-03-30T01:00:00Z"), bali("b", "2027-03-30T02:00:00Z"), { kind: "activity", startsAt: "2027-03-30T03:00:00Z", tz: "Asia/Kolkata" }];
    expect(planZone(items, "2027-03-30", "Asia/Kolkata")).toBe("Asia/Makassar");
  });
});
