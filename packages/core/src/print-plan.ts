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
  header: { name: string; startDate: string | null; endDate: string | null; destination: string | null; printed: string; travellers: string[] };
  days: PrintDay[];
}

const KIND_LABEL: Record<ItemKind, string> = { flight: "Flight", stay: "Stay", transport: "Transport", activity: "Activity", plan: "Plan" };
const DAY_MS = 86_400_000;
const dayNumber = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
const fullDate = (date: string, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...o }).format(new Date(`${date}T12:00:00Z`)).replace(/,/g, "");

/** What to say about a stay on a day: when to check in or out, or which night it is. */
export function stayNote(item: Item, date: string): string {
  const first = localDate(Date.parse(item.startsAt), item.tz);
  const last = item.endsAt ? localDate(Date.parse(item.endsAt), item.tz) : first;
  const nights = dayNumber(last) - dayNumber(first);
  if (date === first && (!item.endsAt || nights > 0)) return `Check-in ${formatTime(item.startsAt, item.tz)}`;
  if (item.endsAt && date === last && nights > 0) return `Check-out ${formatTime(item.endsAt, item.tz)}`;
  if (nights > 1 && date > first && date < last) return `Night ${dayNumber(date) - dayNumber(first) + 1} of ${nights}`;
  return "Staying here";
}

function stayLine(stay: Item, date: string): string {
  const note = stayNote(stay, date);
  return note === "Staying here" ? `Staying: ${stay.title}` : `Staying: ${stay.title}, ${note[0]!.toLowerCase()}${note.slice(1)}`;
}

const byStart = (a: Item, b: Item) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * The trip as a printable plan, day by day, with only what the viewer can see (group plans, their own private plans,
 * optional plans they joined). Days and the "(local)" mark use the trip's zone: that of its first plan that is not a
 * flight, since a flight starts somewhere else.
 */
export function buildPrintPlan(snapshot: TripSnapshot, opts: PrintOptions): PrintPlan {
  const joined = new Set(snapshot.rsvps.filter((r) => r.userId === opts.viewerId).map((r) => r.itemId));
  const items = exportableItems(snapshot.items, opts.viewerId, joined, { includePrivate: true, includeOptional: opts.includeOptional }).sort(byStart);
  const tripTz = (items.find((i) => i.kind !== "flight") ?? items[0])?.tz ?? opts.deviceTz;
  const stays = items.filter((i) => i.kind === "stay");
  const plans = items.filter((i) => i.kind !== "stay");
  const stayRange = (s: Item) => ({ from: localDate(Date.parse(s.startsAt), s.tz), to: s.endsAt ? localDate(Date.parse(s.endsAt), s.tz) : localDate(Date.parse(s.startsAt), s.tz) });

  const dates = [
    snapshot.trip.startDate,
    snapshot.trip.endDate,
    ...plans.map((p) => localDate(Date.parse(p.startsAt), tripTz)),
    ...stays.flatMap((s) => Object.values(stayRange(s))),
  ].filter((d): d is string => !!d);
  const first = dates.reduce<string | null>((a, b) => (a === null || b < a ? b : a), null);
  const last = dates.reduce<string | null>((a, b) => (a === null || b > a ? b : a), null);

  const days: PrintDay[] = [];
  if (first && last) {
    for (let date = first, n = 1; date <= last; date = addDays(date, 1), n += 1) {
      days.push({
        date,
        heading: `Day ${n} · ${fullDate(date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}`,
        stays: stays.filter((s) => { const r = stayRange(s); return date >= r.from && date <= r.to; }).map((s) => stayLine(s, date)),
        plans: plans
          .filter((p) => localDate(Date.parse(p.startsAt), tripTz) === date)
          .map((p) => {
            const notes = typeof p.details.notes === "string" ? p.details.notes.trim() : "";
            return {
              id: p.id,
              kind: KIND_LABEL[p.kind] ?? "Plan",
              time: formatTimeRange(p.startsAt, p.endsAt, p.tz, p.endTz) + (p.tz !== tripTz ? " (local)" : ""),
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
    },
    days,
  };
}
