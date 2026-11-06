import { describe, expect, it } from "vitest";
import { clampScale, clampZoom, cropBy, moveBy, normAngle, snapTurn } from "../src/poster/gestures";
import { NO_EDIT } from "../src/poster/types";

describe("poster gestures", () => {
  it("normalises angles", () => {
    expect(normAngle(190)).toBe(-170);
    expect(normAngle(-190)).toBe(170);
    expect(normAngle(360)).toBe(0);
  });

  it("snaps a turn to straight when it is within 3 degrees, counting the template's own tilt", () => {
    expect(snapTurn(-6, 8)).toEqual({ rot: 6, shown: 0, snapped: true });
    expect(snapTurn(0, 88)).toEqual({ rot: 90, shown: 90, snapped: true });
    expect(snapTurn(0, 20)).toEqual({ rot: 20, shown: 20, snapped: false });
  });

  it("moves by the share of the poster dragged", () => {
    expect(moveBy(NO_EDIT, 30, -60, 300, 600)).toEqual({ tx: 10, ty: -10 });
  });

  it("slides the picture the way the finger goes, even on a turned photo", () => {
    const straight = cropBy(NO_EDIT, 20, 0, 0, 160);
    expect(straight.ox).toBeCloseTo(30);
    expect(straight.oy).toBeCloseTo(50);
    const sideways = cropBy(NO_EDIT, 0, 20, 90, 160);
    expect(sideways.ox).toBeCloseTo(30);
    expect(cropBy(NO_EDIT, -1000, 0, 0, 100).ox).toBe(100);
  });

  it("keeps sizes in range", () => {
    expect(clampScale(9)).toBe(2.5);
    expect(clampScale(0.1)).toBe(0.4);
    expect(clampZoom(0.5)).toBe(1);
  });
});
