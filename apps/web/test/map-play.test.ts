import { describe, expect, it } from "vitest";
import { tickPlay, type PlayClock } from "../src/lib/map-play";

const stops = [{ at: 0 }, { at: 2400 }];
const start: PlayClock = { elapsed: 0, flown: 0, holding: false };

describe("tickPlay", () => {
  it("stays on the current map until its tiles have loaded, instead of flying to a blank place", () => {
    const held = tickPlay(start, 16, false, false, stops);
    expect(held.flyTo).toBeNull();
    expect(held.clock).toEqual({ elapsed: 0, flown: 0, holding: true });
    const still = tickPlay(held.clock, 500, false, false, stops);
    expect(still.clock.elapsed).toBe(0);
    expect(still.clock.flown).toBe(0);
  });

  it("flies once the current place is loaded, then waits for the place it moved to", () => {
    const held = tickPlay(start, 16, false, false, stops).clock;
    const flown = tickPlay(held, 16, false, true, stops);
    expect(flown.flyTo).toBe(0);
    expect(flown.clock).toEqual({ elapsed: 0, flown: 1, holding: true });
    const waiting = tickPlay(flown.clock, 800, false, false, stops);
    expect(waiting.flyTo).toBeNull();
    expect(waiting.clock.elapsed).toBe(0);
    expect(waiting.clock.flown).toBe(1);
  });

  it("carries on toward the next stop only after the new place has loaded", () => {
    const parked: PlayClock = { elapsed: 0, flown: 1, holding: true };
    const released = tickPlay(parked, 100, false, true, stops);
    expect(released.flyTo).toBeNull();
    expect(released.clock.holding).toBe(false);
    expect(released.clock.elapsed).toBe(100);
    const next = tickPlay({ ...released.clock, elapsed: 2400 }, 16, false, true, stops);
    expect(next.flyTo).toBe(1);
  });

  it("pause freezes the clock and does not fly", () => {
    const mid: PlayClock = { elapsed: 1000, flown: 1, holding: false };
    expect(tickPlay(mid, 400, true, true, stops)).toEqual({ clock: mid, flyTo: null });
    const held: PlayClock = { elapsed: 0, flown: 0, holding: true };
    expect(tickPlay(held, 400, true, true, stops).clock).toEqual(held);
  });
});
