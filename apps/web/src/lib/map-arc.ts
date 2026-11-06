/** A point on the map as [longitude, latitude]. */
export type LngLat = [number, number];

/**
 * A curved route from `a` to `b`: a gentle arch that bows towards the north, like a flight path, so two stops
 * read as a hop and not as a ruler line. `lift` is how far the middle rises, as a share of the distance.
 */
export function arcPoints(a: LngLat, b: LngLat, steps = 40, lift = 0.22): LngLat[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const mid: LngLat = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  // Perpendicular to the leg, pointing north (up the screen). A due-north leg bows east.
  let px = -dy;
  let py = dx;
  if (py < 0 || (py === 0 && px < 0)) {
    px = -px;
    py = -py;
  }
  const control: LngLat = [mid[0] + px * lift, mid[1] + py * lift];
  const out: LngLat[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * control[0] + t * t * b[0], u * u * a[1] + 2 * u * t * control[1] + t * t * b[1]]);
  }
  return out;
}

/** One arc for each hop between consecutive stops: A to B, B to C, and so on. */
export function legsFor(stops: LngLat[]): LngLat[][] {
  const legs: LngLat[][] = [];
  for (let i = 1; i < stops.length; i += 1) {
    const from = stops[i - 1]!;
    const to = stops[i]!;
    if (from[0] === to[0] && from[1] === to[1]) continue; // two plans in the same place need no line
    legs.push(arcPoints(from, to));
  }
  return legs;
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** Opening the map draws quickly. Playing the trip holds each hop so the stop can be read. */
export type DrawPace = "draw" | "play";

/** A played hop stays on screen this long, however many stops the day has. */
export const PLAY_HOP_MS = 2400;

/** Quiet moment after a day finishes, before the next day starts. */
export const PLAY_DAY_GAP_MS = 1800;

/** How long each hop takes to draw. A long trip's first drawing stays under about 3.2 s. Playing does not. */
export function legMs(count: number, pace: DrawPace = "draw"): number {
  if (count === 0) return 0;
  if (pace === "play") return PLAY_HOP_MS;
  return Math.min(650, 3200 / count);
}

/** The line as it looks `elapsed` ms after it starts drawing: finished hops in full, the current one part-way, the rest empty. */
export function drawnAt(legs: LngLat[][], elapsed: number, pace: DrawPace = "draw"): LngLat[][] {
  const per = legMs(legs.length, pace);
  return legs.map((leg, index) => {
    const t = per === 0 ? 1 : Math.min(1, Math.max(0, (elapsed - index * per) / per));
    if (t <= 0) return [];
    if (t >= 1) return leg;
    const upTo = Math.max(1, Math.round(easeInOut(t) * (leg.length - 1)));
    return leg.slice(0, upTo + 1);
  });
}

/** When the whole line is finished. */
export function totalMs(legs: LngLat[][], pace: DrawPace = "draw"): number {
  return legMs(legs.length, pace) * legs.length;
}
