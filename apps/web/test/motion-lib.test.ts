import { describe, expect, it } from "vitest";
import { shouldDismissSheet, swipeDay, swipeDirection } from "../src/lib/gestures";

describe("swipeDirection", () => {
  it("a clear swipe left means 'next', and right means 'previous'", () => {
    expect(swipeDirection(-120, 0)).toBe("next");
    expect(swipeDirection(120, 0)).toBe("previous");
  });

  it("a short, slow drag is ignored", () => {
    expect(swipeDirection(-30, -100)).toBeNull();
    expect(swipeDirection(40, 200)).toBeNull();
  });

  it("a quick flick counts even over a short distance", () => {
    expect(swipeDirection(-40, -900)).toBe("next");
    expect(swipeDirection(40, 900)).toBe("previous");
  });

  it("a mostly vertical gesture is a scroll, not a swipe", () => {
    expect(swipeDirection(-100, 0, 400)).toBeNull();
  });
});

describe("shouldDismissSheet", () => {
  it("closes when dragged far enough down, or flicked down", () => {
    expect(shouldDismissSheet(150, 0)).toBe(true);
    expect(shouldDismissSheet(30, 900)).toBe(true);
  });

  it("stays open for a small or upward drag", () => {
    expect(shouldDismissSheet(40, 100)).toBe(false);
    expect(shouldDismissSheet(-200, -900)).toBe(false);
  });
});

describe("swipeDay", () => {
  it("moves to the next or previous day", () => {
    expect(swipeDay("2026-12-02", "next", null, null)).toBe("2026-12-03");
    expect(swipeDay("2026-12-02", "previous", null, null)).toBe("2026-12-01");
  });

  it("does not leave the trip's dates when it has them", () => {
    expect(swipeDay("2026-12-05", "next", "2026-12-01", "2026-12-05")).toBeNull();
    expect(swipeDay("2026-12-01", "previous", "2026-12-01", "2026-12-05")).toBeNull();
    expect(swipeDay("2026-12-03", "next", "2026-12-01", "2026-12-05")).toBe("2026-12-04");
  });

  it("works across month and year ends", () => {
    expect(swipeDay("2026-12-31", "next", null, null)).toBe("2027-01-01");
  });
});
