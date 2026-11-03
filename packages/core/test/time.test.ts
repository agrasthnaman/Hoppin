import { describe, expect, it } from "vitest";
import { addDays, dayRange, formatTime, instantToZonedInput, zonedTimeToInstant } from "../src/time";

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
