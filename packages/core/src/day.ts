import { dayRange } from "./time";
import type { Item } from "./types";

/** Key in `DayLayout.chips` for optional plans. They are never nested under a flight or another booking. */
export const UNANCHORED = "unanchored";

export interface DayLayout {
  /** Group items in time order: flights, stays, fixed bookings, group activities. */
  blocks: Item[];
  /** Shared optional plans, always under `UNANCHORED`, in start-time order. */
  chips: Record<string, Item[]>;
  /** The viewer's own private items. Other people's private items are never included. */
  privateLines: Item[];
}

const ms = (iso: string) => new Date(iso).getTime();
const HOUR = 3_600_000;

function endOf(item: Item): number {
  return item.endsAt ? ms(item.endsAt) : ms(item.startsAt);
}

/** Item touches the day if it starts before the day ends and ends after the day starts (a zero-length item counts if inside). */
function touchesDay(item: Item, range: { start: number; end: number }): boolean {
  const start = ms(item.startsAt);
  const end = endOf(item);
  return start < range.end && (end > range.start || (end === start && start >= range.start));
}

/**
 * Lays out one calendar day for a viewer. The day is the calendar day in `viewerTz`, so the same
 * item can fall on different days for viewers in different zones. An item that spans midnight shows
 * on every day it touches, once per day.
 *
 * Optional plans ("anyone can join") stay their own plans. A flight or stay that covers the same
 * hours does not take them in.
 */
export function buildDay(items: Item[], viewerId: string, date: string, viewerTz: string): DayLayout {
  const range = dayRange(date, viewerTz);
  const seen = new Set<string>();
  const today = items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return touchesDay(item, range);
  });
  const byStart = (a: Item, b: Item) => ms(a.startsAt) - ms(b.startsAt) || a.title.localeCompare(b.title);

  const blocks = today.filter((i) => i.visibility === "shared" && i.groupItem).sort(byStart);
  const optional = today.filter((i) => i.visibility === "shared" && !i.groupItem).sort(byStart);
  const privateLines = today.filter((i) => i.visibility === "private" && i.ownerId === viewerId).sort(byStart);

  const chips: Record<string, Item[]> = {};
  if (optional.length > 0) chips[UNANCHORED] = optional;
  return { blocks, chips, privateLines };
}

/**
 * The plan to spotlight on a day: the one happening now, or else the next to start. Multi-day stays are skipped
 * (they would always win) unless they are all there is. A plan with no end time counts as an hour long.
 * Returns null when everything is over.
 */
export function nextBlock(blocks: Item[], now: number): string | null {
  const sorted = [...blocks].sort((a, b) => ms(a.startsAt) - ms(b.startsAt));
  const candidates = sorted.some((b) => b.kind !== "stay") ? sorted.filter((b) => b.kind !== "stay") : sorted;
  const upcoming = candidates.find((b) => (b.endsAt ? ms(b.endsAt) : ms(b.startsAt) + HOUR) >= now);
  return upcoming?.id ?? null;
}
