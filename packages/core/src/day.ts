import { dayRange } from "./time";
import type { Item } from "./types";

/** Key in `DayLayout.chips` for optional plans on a day that has no block to attach them to. */
export const UNANCHORED = "unanchored";

export interface DayLayout {
  /** Group items in time order: flights, stays, fixed bookings, group activities. */
  blocks: Item[];
  /** Shared optional plans, keyed by the id of the block whose slot they fall in (or UNANCHORED). */
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

/** Picks the block a chip belongs under: the latest-starting block it falls inside, else the nearest earlier one, else the first. */
function anchorFor(chip: Item, candidates: Item[]): Item | undefined {
  const at = ms(chip.startsAt);
  const slotEnd = (b: Item) => (b.endsAt ? ms(b.endsAt) : ms(b.startsAt) + HOUR);
  const started = candidates.filter((b) => ms(b.startsAt) <= at);
  const inside = started.filter((b) => at < slotEnd(b));
  const pool = inside.length > 0 ? inside : started;
  if (pool.length > 0) return pool[pool.length - 1]; // candidates are sorted by start, so the last is the latest
  return candidates[0];
}

/**
 * Lays out one calendar day for a viewer. The day is the calendar day in `viewerTz`, so the same
 * item can fall on different days for viewers in different zones. An item that spans midnight shows
 * on every day it touches, once per day.
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

  // A whole-trip stay would swallow every chip, so chips prefer other blocks and use stays only as a last resort.
  const nonStays = blocks.filter((b) => b.kind !== "stay");
  const candidates = nonStays.length > 0 ? nonStays : blocks;

  const chips: Record<string, Item[]> = {};
  for (const chip of optional) {
    const key = anchorFor(chip, candidates)?.id ?? UNANCHORED;
    (chips[key] ??= []).push(chip);
  }
  return { blocks, chips, privateLines };
}
