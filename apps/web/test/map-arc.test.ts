import { describe, expect, it } from "vitest";
import { arcPoints, drawnAt, legMs, legsFor, totalMs, type LngLat } from "../src/lib/map-arc";

const A: LngLat = [115.0, -8.8];
const B: LngLat = [115.4, -8.5];
const C: LngLat = [115.2, -8.3];

describe("arcPoints", () => {
  it("starts at the first stop and ends at the second, and bows away from the straight line", () => {
    const arc = arcPoints(A, B, 20);
    expect(arc).toHaveLength(21);
    expect(arc[0]).toEqual(A);
    expect(arc[20]![0]).toBeCloseTo(B[0]);
    expect(arc[20]![1]).toBeCloseTo(B[1]);
    const middle = arc[10]!;
    const straight: LngLat = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    expect(Math.hypot(middle[0] - straight[0], middle[1] - straight[1])).toBeGreaterThan(0.01);
    expect(middle[1]).toBeGreaterThan(straight[1]); // the arch rises towards the north
  });

  it("bows north whichever way the leg runs", () => {
    const forward = arcPoints(A, B, 2)[1]!;
    const back = arcPoints(B, A, 2)[1]!;
    expect(forward[1]).toBeGreaterThan(-8.65);
    expect(back[1]).toBeGreaterThan(-8.65);
  });
});

describe("legsFor", () => {
  it("makes one hop per pair of stops, in order", () => {
    const legs = legsFor([A, B, C]);
    expect(legs).toHaveLength(2);
    expect(legs[0]![0]).toEqual(A);
    expect(legs[1]![0]).toEqual(B);
  });
  it("makes nothing for one stop, and skips a hop between two plans in the same place", () => {
    expect(legsFor([A])).toEqual([]);
    expect(legsFor([A, A, B])).toHaveLength(1);
  });
});

describe("drawing the line hop by hop", () => {
  const legs = legsFor([A, B, C]);
  it("draws the first hop before the second starts", () => {
    const early = drawnAt(legs, legMs(2) / 2);
    expect(early[0]!.length).toBeGreaterThan(1);
    expect(early[0]!.length).toBeLessThan(legs[0]!.length);
    expect(early[1]).toEqual([]);
  });
  it("has the second hop under way once the first is done", () => {
    const mid = drawnAt(legs, legMs(2) * 1.5);
    expect(mid[0]).toEqual(legs[0]);
    expect(mid[1]!.length).toBeGreaterThan(1);
    expect(mid[1]!.length).toBeLessThan(legs[1]!.length);
  });
  it("is complete at the end and stays put afterwards", () => {
    expect(drawnAt(legs, totalMs(legs))).toEqual(legs);
    expect(drawnAt(legs, totalMs(legs) + 60_000)).toEqual(legs);
  });
  it("never takes longer than about three seconds, however many stops", () => {
    expect(legMs(2)).toBe(650);
    expect(legMs(20) * 20).toBeLessThanOrEqual(3200);
    expect(legMs(0)).toBe(0);
  });
  it("lets a played trip sit on each hop long enough to read it", () => {
    expect(legMs(2, "play")).toBeGreaterThanOrEqual(2000);
    expect(legMs(8, "play")).toBe(legMs(2, "play"));
  });
});
