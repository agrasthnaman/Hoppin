import { addDays } from "@hoppin/core";

const DISTANCE = 80; // px dragged sideways that counts as a swipe
const FLICK = 500; // px/s that counts even over a short distance

/**
 * Turns the end of a sideways drag into "next", "previous" or nothing. A mostly vertical gesture is a scroll,
 * not a swipe, so it is ignored.
 */
export function swipeDirection(offsetX: number, velocityX: number, offsetY = 0): "next" | "previous" | null {
  if (Math.abs(offsetY) > Math.abs(offsetX)) return null;
  const far = Math.abs(offsetX) >= DISTANCE;
  const fast = Math.abs(velocityX) >= FLICK && Math.abs(offsetX) >= 24;
  if (!far && !fast) return null;
  return offsetX < 0 ? "next" : "previous";
}

/** A bottom sheet closes when dragged far enough down, or flicked down. */
export function shouldDismissSheet(offsetY: number, velocityY: number): boolean {
  return offsetY >= 120 || (velocityY >= 500 && offsetY > 0);
}

/** The day a swipe leads to, or null if it would leave the trip's dates. */
export function swipeDay(date: string, direction: "next" | "previous", start: string | null, end: string | null): string | null {
  const target = addDays(date, direction === "next" ? 1 : -1);
  if (start && end && (target < start || target > end)) return null;
  return target;
}
