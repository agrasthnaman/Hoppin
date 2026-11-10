import { exportableItems } from "./ics";
import { itemPlace } from "./place";
import { addDays, formatTime, formatTimeRange, localDate } from "./time";
import type { Item, ItemKind, TripSnapshot } from "./types";

export interface PrintOptions {
  viewerId: string;
  /** Off by default where it is asked: notes can hold booking numbers. */
  includeNotes: boolean;
  includeOptional: boolean;
  /** When the page is printed, for the "Printed" line, in the device's zone. */
  printedAt: number;
  deviceTz: string;
  /** Show every time in this zone instead of the trip's. Ignored when it is not a real zone. */
  displayTz?: string | null;
}

/** The zone the plan's times are shown in, for saying so on the page. `chosen` is false for the trip's own zone. */
export interface PrintZone {
  tz: string;
  label: string;
  chosen: boolean;
}

export interface PrintPlanItem {
  id: string;
  kind: string;
  time: string;
  title: string;
  place: string | null;
  /** The map link, shown as plain text (paper cannot be clicked). */
  link: string | null;
  notes: string | null;
}

export interface PrintDay {
  date: string;
  heading: string;
  stays: string[];
  plans: PrintPlanItem[];
}

export interface PrintPlan {
  header: { name: string; startDate: string | null; endDate: string | null; destination: string | null; printed: string; travellers: string[]; zone: PrintZone };
  days: PrintDay[];
  /** Zones of the plans shown, the trip's own first: the choices to offer for `displayTz`. */
  zones: string[];
}

export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Old names some devices and saved plans still use, shown by the city's current name.
const RENAMED: Record<string, string> = { Calcutta: "Kolkata", Saigon: "Ho Chi Minh", Katmandu: "Kathmandu", Rangoon: "Yangon", Kiev: "Kyiv" };

/** "Makassar · GMT+8": the zone's city and its offset at `at` (the same wording as the zone picker on Days). */
export function zoneLabel(tz: string, at: number = Date.now()): string {
  const last = (tz.split("/").pop() ?? tz).replace(/_/g, " ");
  const city = tz === "UTC" ? "UTC" : (RENAMED[last] ?? last);
  const offset = new Intl.DateTimeFormat("en-GB", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value;
  return offset && offset !== city ? `${city} · ${offset}` : city;
}

/** The trip's own zone: that of its first plan that is not a flight, since a flight starts somewhere else. */
function ownZone(items: readonly Item[]): string | null {
  const sorted = [...items].sort(byStart);
  return (sorted.find((i) => i.kind !== "flight") ?? sorted[0])?.tz ?? null;
}

/** The zones a trip's plans are in (start and end), the trip's own first. */
export function tripZones(items: readonly Item[]): string[] {
  const own = ownZone(items);
  const all = new Set<string>(own ? [own] : []);
  for (const i of [...items].sort(byStart)) {
    all.add(i.tz);
    if (i.endTz) all.add(i.endTz);
  }
  return [...all];
}

const KIND_LABEL: Record<ItemKind, string> = { flight: "Flight", stay: "Stay", transport: "Transport", activity: "Activity", plan: "Plan" };
const DAY_MS = 86_400_000;
const dayNumber = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
const fullDate = (date: string, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...o }).format(new Date(`${date}T12:00:00Z`)).replace(/,/g, "");

/** What to say about a stay on a day: when to check in or out, or which night it is. */
/** `tz` is the zone the day is in; by default the stay's own. */
export function stayNote(item: Item, date: string, tz: string = item.tz): string {
  const first = localDate(Date.parse(item.startsAt), tz);
  const last = item.endsAt ? localDate(Date.parse(item.endsAt), tz) : first;
  const nights = dayNumber(last) - dayNumber(first);
  if (date === first && (!item.endsAt || nights > 0)) return `Check-in ${formatTime(item.startsAt, tz)}`;
  if (item.endsAt && date === last && nights > 0) return `Check-out ${formatTime(item.endsAt, tz)}`;
  if (nights > 1 && date > first && date < last) return `Night ${dayNumber(date) - dayNumber(first) + 1} of ${nights}`;
  return "Staying here";
}

function stayLine(stay: Item, date: string, tz: string): string {
  const note = stayNote(stay, date, tz);
  return note === "Staying here" ? `Staying: ${stay.title}` : `Staying: ${stay.title}, ${note[0]!.toLowerCase()}${note.slice(1)}`;
}

const byStart = (a: Item, b: Item) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * The trip as a printable plan, day by day, with only what the viewer can see (group plans, their own private plans,
 * optional plans they joined). By default days use the trip's own zone and each time is in its plan's zone, marked
 * "(local)" when that differs; with `displayTz`, days and every time use that zone instead.
 */
export function buildPrintPlan(snapshot: TripSnapshot, opts: PrintOptions): PrintPlan {
  const joined = new Set(snapshot.rsvps.filter((r) => r.userId === opts.viewerId).map((r) => r.itemId));
  const items = exportableItems(snapshot.items, opts.viewerId, joined, { includePrivate: true, includeOptional: opts.includeOptional }).sort(byStart);
  const tripTz = ownZone(items) ?? opts.deviceTz;
  const chosen = !!opts.displayTz && isTimeZone(opts.displayTz);
  const zone = chosen ? opts.displayTz! : tripTz;
  const stayZone = (s: Item) => (chosen ? zone : s.tz);
  const stays = items.filter((i) => i.kind === "stay");
  const plans = items.filter((i) => i.kind !== "stay");
  const stayRange = (s: Item) => {
    const from = localDate(Date.parse(s.startsAt), stayZone(s));
    return { from, to: s.endsAt ? localDate(Date.parse(s.endsAt), stayZone(s)) : from };
  };

  const tripStart = snapshot.trip.startDate;
  const tripEnd = snapshot.trip.endDate;
  // A dated trip prints only its own days. A plan saved outside them (a poll winner on a random date) must not
  // stretch the page across every empty day in between.
  const bounded = !!(tripStart && tripEnd && tripEnd >= tripStart);
  const dates = (bounded
    ? [tripStart, tripEnd]
    : [...plans.map((p) => localDate(Date.parse(p.startsAt), zone)), ...stays.flatMap((s) => Object.values(stayRange(s)))]
  ).filter((d): d is string => !!d);
  const first = dates.reduce<string | null>((a, b) => (a === null || b < a ? b : a), null);
  const last = dates.reduce<string | null>((a, b) => (a === null || b > a ? b : a), null);

  const days: PrintDay[] = [];
  if (first && last) {
    for (let date = first, n = 1; date <= last; date = addDays(date, 1), n += 1) {
      days.push({
        date,
        heading: `Day ${n} · ${fullDate(date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}`,
        stays: stays.filter((s) => { const r = stayRange(s); return date >= r.from && date <= r.to; }).map((s) => stayLine(s, date, stayZone(s))),
        plans: plans
          .filter((p) => localDate(Date.parse(p.startsAt), zone) === date)
          .map((p) => {
            const notes = typeof p.details.notes === "string" ? p.details.notes.trim() : "";
            return {
              id: p.id,
              kind: KIND_LABEL[p.kind] ?? "Plan",
              time: chosen ? formatTimeRange(p.startsAt, p.endsAt, zone, zone) : formatTimeRange(p.startsAt, p.endsAt, p.tz, p.endTz) + (p.tz !== tripTz ? " (local)" : ""),
              title: p.title,
              place: itemPlace(p)?.label ?? null,
              link: p.locationUrl,
              notes: opts.includeNotes && notes ? notes : null,
            };
          }),
      });
    }
  }

  return {
    header: {
      name: snapshot.trip.name,
      startDate: snapshot.trip.startDate,
      endDate: snapshot.trip.endDate,
      destination: snapshot.trip.destination?.name ?? null,
      printed: `Printed ${fullDate(localDate(opts.printedAt, opts.deviceTz), { day: "numeric", month: "short", year: "numeric" })}`,
      travellers: snapshot.members.filter((m) => m.status === "approved").map((m) => m.displayName.trim().split(/\s+/)[0] ?? m.displayName),
      zone: { tz: zone, label: zoneLabel(zone, opts.printedAt), chosen },
    },
    days,
    zones: tripZones(items),
  };
}
