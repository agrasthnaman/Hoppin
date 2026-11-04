export type Place = { x: number; y: number };
export type Origin = { left: number; top: number };

/** Keep a point on the same screen pixel when the canvas origin moves. */
export function keepScreenPlace(local: Place, previous: Origin, next: Origin): Place {
  return {
    x: local.x + previous.left - next.left,
    y: local.y + previous.top - next.top,
  };
}
