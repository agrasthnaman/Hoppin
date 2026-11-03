import { describe, expect, it } from "vitest";
import { formatDateRange } from "../src/lib/dates";

describe("formatDateRange", () => {
  it("shows a range within one month compactly", () => {
    expect(formatDateRange("2026-12-01", "2026-12-05")).toBe("1–5 Dec 2026");
  });
  it("shows both months, and both years when they differ", () => {
    expect(formatDateRange("2026-11-28", "2026-12-02")).toBe("28 Nov – 2 Dec 2026");
    expect(formatDateRange("2026-12-28", "2027-01-02")).toBe("28 Dec 2026 – 2 Jan 2027");
  });
  it("handles a single day, a start only, and no dates", () => {
    expect(formatDateRange("2026-12-01", "2026-12-01")).toBe("1 Dec 2026");
    expect(formatDateRange("2026-12-01", null)).toBe("From 1 Dec 2026");
    expect(formatDateRange(null, null)).toBe("Dates not set");
    expect(formatDateRange(undefined, undefined)).toBe("Dates not set");
  });
});
