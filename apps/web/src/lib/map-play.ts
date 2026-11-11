/** The play clock. `holding` means the camera is waiting until the map under it has loaded. */
export interface PlayClock {
  elapsed: number;
  flown: number;
  holding: boolean;
}

/**
 * One frame of "Play trip".
 * The clock does not run past a stop until the map already on screen has loaded, and after a move it waits
 * until the new place has loaded. Pausing freezes the clock wherever it is.
 */
export function tickPlay(
  clock: PlayClock,
  dt: number,
  paused: boolean,
  tilesReady: boolean,
  stops: readonly { at: number }[],
): { clock: PlayClock; flyTo: number | null } {
  if (paused || dt < 0) return { clock, flyTo: null };
  if (clock.holding) {
    if (!tilesReady) return { clock, flyTo: null };
    return tickPlay({ ...clock, holding: false }, dt, false, true, stops);
  }
  const next = stops[clock.flown];
  if (next && clock.elapsed + dt >= next.at) {
    if (!tilesReady) return { clock: { ...clock, elapsed: next.at, holding: true }, flyTo: null };
    return { clock: { elapsed: next.at, flown: clock.flown + 1, holding: true }, flyTo: clock.flown };
  }
  return { clock: { ...clock, elapsed: clock.elapsed + dt }, flyTo: null };
}
