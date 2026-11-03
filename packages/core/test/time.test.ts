import { describe, expect, it } from "vitest";
import { addDays, dayRange, formatTime } from "../src/time";

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
