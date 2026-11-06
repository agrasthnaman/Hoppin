import type { Item } from "./types";

const HOUR = 3_600_000;
const ms = (iso: string) => new Date(iso).getTime();

function endOf(item: Item): number {
  return item.endsAt ? ms(item.endsAt) : ms(item.startsAt) + HOUR;
}

function visible(item: Item, viewerId: string): boolean {
  return item.visibility !== "private" || item.ownerId === viewerId;
}

function covers(item: Item, now: number): boolean {
  return ms(item.startsAt) <= now && now < endOf(item);
}

function byStart(a: Item, b: Item): number {
  return ms(a.startsAt) - ms(b.startsAt) || a.title.localeCompare(b.title);
}

/** The plan happening now. A group plan wins over an optional one that overlaps it. */
function happening(items: Item[], now: number): Item | null {
  const open = items.filter((item) => covers(item, now)).sort(byStart);
  const group = open.filter((item) => item.groupItem);
  const pool = group.length > 0 ? group : open;
  return pool[pool.length - 1] ?? null;
}

export interface NowAndNext {
  current: Item | null;
  next: Item | null;
  stay: Item | null;
}

/**
 * What the viewer should see right now: the plan in progress, the next one, and the stay
 * that covers this moment (with its address and map link on the item). Other people's
 * private plans are left out. Times are instants, so a flight that leaves one zone and
 * lands in another stays current for the whole journey.
 */
export function nowAndNext(items: Item[], viewerId: string, now: Date): NowAndNext {
  const t = now.getTime();
  const seen = items.filter((item) => visible(item, viewerId));
  const plans = seen.filter((item) => item.kind !== "stay");
  const stays = seen.filter((item) => item.kind === "stay");
  return {
    current: happening(plans, t),
    next: plans.filter((item) => ms(item.startsAt) > t).sort(byStart)[0] ?? null,
    stay: happening(stays, t),
  };
}

/** The trip whose dates contain today, or null when none of them do. */
export function currentTripId(
  trips: readonly { id: string; startDate?: string | null; endDate?: string | null }[],
  today: string,
): string | null {
  return trips.find((trip) => trip.startDate && trip.endDate && trip.startDate <= today && today <= trip.endDate)?.id ?? null;
}

/** "now", "in 25 min", "in 2 h 10 min", "in 3 days": how far away a moment is, in words people say. */
export function untilLabel(ms: number): string {
  if (ms < 60_000) return "now";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 6) return minutes % 60 === 0 ? `in ${hours} h` : `in ${hours} h ${minutes % 60} min`;
  if (hours < 36) return `in ${Math.round(minutes / 60)} h`;
  return `in ${Math.round(hours / 24)} days`;
}

/** How far through a plan it is, from 0 to 1 (a plan with no end time counts as an hour long). */
export function planProgress(item: Item, now: number): number {
  const start = ms(item.startsAt);
  const end = endOf(item);
  if (end <= start) return 0;
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}
