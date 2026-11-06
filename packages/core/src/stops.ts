import { buildDay, UNANCHORED } from "./day";
import { itemPlace } from "./place";
import { addDays, localDate } from "./time";
import type { Item, ItemKind, Place } from "./types";

/** One placed plan on one day. `order` starts at 1 for stops; stays are 0 and are not numbered. */
export interface Stop {
  itemId: string;
  date: string;
  order: number;
  kind: ItemKind;
  title: string;
  startsAt: string;
  endsAt: string | null;
  tz: string;
  endTz?: string | null;
  place: Place;
}

/** Placed stops, the stays that cover the day, and plans that still have no place. */
export interface DayStops {
  date: string;
  stops: Stop[];
  stays: Stop[];
  unplaced: Item[];
}

const byStart = (a: Item, b: Item) => a.startsAt.localeCompare(b.startsAt) || a.title.localeCompare(b.title);

function asStop(item: Item, date: string, order: number, place: Place): Stop {
  return {
    itemId: item.id,
    date,
    order,
    kind: item.kind,
    title: item.title,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    tz: item.tz,
    ...(item.endTz ? { endTz: item.endTz } : {}),
    place,
  };
}

/**
 * The stops for one day. Group plans and the viewer's private plans count. An optional plan counts
 * only when the viewer has joined it. A flight with no place is left out entirely. Stays with a place
 * are listed apart from the numbered stops.
 */
export function dayStops(items: Item[], viewerId: string, joinedItemIds: ReadonlySet<string>, date: string, viewerTz: string): DayStops {
  const layout = buildDay(items, viewerId, date, viewerTz);
  const joined = (layout.chips[UNANCHORED] ?? []).filter((item) => joinedItemIds.has(item.id));
  const visible = [...layout.blocks, ...joined, ...layout.privateLines].sort(byStart);
  const stays: Stop[] = [];
  const placed: Item[] = [];
  const unplaced: Item[] = [];

  for (const item of visible) {
    const place = itemPlace(item);
    if (item.kind === "stay") {
      if (place) stays.push(asStop(item, date, 0, place));
      else unplaced.push(item);
      continue;
    }
    if (item.kind === "flight" && !place) continue;
    if (place) placed.push(item);
    else unplaced.push(item);
  }

  return {
    date,
    stops: placed.map((item, index) => asStop(item, date, index + 1, itemPlace(item)!)),
    stays,
    unplaced,
  };
}

function spanOf(items: Item[], viewerTz: string): { start: string; end: string } | null {
  let start: string | null = null;
  let end: string | null = null;
  for (const item of items) {
    const from = localDate(Date.parse(item.startsAt), viewerTz);
    const to = localDate(Date.parse(item.endsAt ?? item.startsAt), viewerTz);
    if (!start || from < start) start = from;
    if (!end || to > end) end = to;
  }
  return start && end ? { start, end } : null;
}

/** Every day from the trip's first to last, or the days the plans cover when the trip has no dates. */
export function tripStops(
  items: Item[],
  viewerId: string,
  joinedItemIds: ReadonlySet<string>,
  startDate: string | null,
  endDate: string | null,
  viewerTz: string,
): DayStops[] {
  const dated = startDate && endDate && endDate >= startDate ? { start: startDate, end: endDate } : spanOf(items, viewerTz);
  if (!dated) return [];
  const days: DayStops[] = [];
  for (let date = dated.start; date <= dated.end && days.length < 400; date = addDays(date, 1)) {
    days.push(dayStops(items, viewerId, joinedItemIds, date, viewerTz));
  }
  return days;
}
