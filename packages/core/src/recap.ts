import { distanceKm } from "./place";
import { tripStops, type DayStops, type Stop } from "./stops";
import type { Item, MemberInfo } from "./types";

/** A day's route as plain points, for drawing the hops on a poster. */
export interface RecapRoute {
  day: number;
  date: string;
  stops: { lat: number; lon: number; title: string }[];
}

/** The facts a poster is drawn from. Built only from group plans, so nothing private can end up on a picture. */
export interface Recap {
  days: number;
  places: number;
  distanceKm: number;
  /** First names of approved members. */
  travellers: string[];
  firstDay: string | null;
  lastDay: string | null;
  busiest: { date: string; plans: number } | null;
  /** Up to 3. */
  topStops: { title: string; going: number }[];
  routes: RecapRoute[];
}

export interface DayRecap {
  stops: { order: number; title: string; time: string }[];
  routes: RecapRoute[];
  plans: number;
}

export interface RecapInput {
  items: Item[];
  rsvps: { itemId: string; userId: string }[];
  members: MemberInfo[];
  startDate: string | null;
  endDate: string | null;
  tz: string;
}

// Nobody owns plans under this id and it has joined nothing, so private and optional plans drop out.
const NOBODY = "\u0000poster";

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";
const placeKey = (s: Stop) => `${s.place.lat.toFixed(4)},${s.place.lon.toFixed(4)}`;

function groupDays(input: RecapInput): DayStops[] {
  return tripStops(input.items, NOBODY, new Set(), input.startDate, input.endDate, input.tz);
}

function routesOf(days: DayStops[]): RecapRoute[] {
  return days.flatMap((day, index) =>
    day.stops.length === 0 ? [] : [{ day: index + 1, date: day.date, stops: day.stops.map((s) => ({ lat: s.place.lat, lon: s.place.lon, title: s.title })) }],
  );
}

function localTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }).format(new Date(iso));
}

export function tripRecap(input: RecapInput): Recap {
  const days = groupDays(input);
  const stops = days.flatMap((d) => d.stops);
  const going = new Map<string, number>();
  for (const r of input.rsvps) going.set(r.itemId, (going.get(r.itemId) ?? 0) + 1);

  let km = 0;
  for (const day of days) {
    for (let i = 1; i < day.stops.length; i += 1) km += distanceKm(day.stops[i - 1]!.place, day.stops[i]!.place);
  }

  const unique = new Map<string, Stop>();
  for (const s of stops) if (!unique.has(s.itemId)) unique.set(s.itemId, s);
  const topStops = [...unique.values()]
    .sort((a, b) => (going.get(b.itemId) ?? 0) - (going.get(a.itemId) ?? 0) || a.startsAt.localeCompare(b.startsAt))
    .slice(0, 3)
    .map((s) => ({ title: s.title, going: going.get(s.itemId) ?? 0 }));

  const busiestDay = days.reduce<DayStops | null>((best, d) => (d.stops.length > (best?.stops.length ?? 0) ? d : best), null);

  return {
    days: days.length,
    places: new Set(stops.map(placeKey)).size,
    distanceKm: Math.round(km),
    travellers: input.members.filter((m) => m.status === "approved").map((m) => firstName(m.displayName)).filter(Boolean),
    firstDay: days[0]?.date ?? null,
    lastDay: days.at(-1)?.date ?? null,
    busiest: busiestDay && busiestDay.stops.length >= 3 ? { date: busiestDay.date, plans: busiestDay.stops.length } : null,
    topStops,
    routes: routesOf(days),
  };
}

export function dayRecap(input: RecapInput, date: string): DayRecap {
  const day = groupDays(input).find((d) => d.date === date);
  if (!day) return { stops: [], routes: [], plans: 0 };
  return {
    stops: day.stops.map((s) => ({ order: s.order, title: s.title, time: localTime(s.startsAt, s.tz) })),
    routes: routesOf([day]).map((r) => ({ ...r, day: 1 })),
    plans: day.stops.length,
  };
}

export function shareText(recap: Recap, tripName: string): string {
  return `${tripName}: ${recap.days} days, ${recap.places} places, ${recap.distanceKm} km. Planned with Hoppin hoppinclub.com`;
}
