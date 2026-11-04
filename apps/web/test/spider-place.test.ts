import { describe, expect, it } from "vitest";
import { keepScreenPlace } from "../src/components/ui/spider-place";

describe("keepScreenPlace", () => {
  it("stays on the same pixel when the day canvas grows from the column to the screen", () => {
    const placed = keepScreenPlace({ x: 384, y: 200 }, { left: 456, top: 80 }, { left: 0, top: 0 });
    expect(placed).toEqual({ x: 840, y: 280 });
  });

  it("does not move when the canvas origin stays put", () => {
    const placed = keepScreenPlace({ x: 120, y: 40 }, { left: 16, top: 16 }, { left: 16, top: 16 });
    expect(placed).toEqual({ x: 120, y: 40 });
  });
});
