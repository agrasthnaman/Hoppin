import { dayRecap, distanceKm, tripRecap, type RecapInput, type TripSnapshot } from "@hoppin/core";
import { joinNames } from "./text";
import type { PhotoSource, PosterData, PosterKind, RoutePoints } from "./types";

const MAX_ROUTE_POINTS = 8;

const parse = (date: string) => new Date(`${date}T12:00:00Z`);
const fmt = (date: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts }).format(parse(date));

/** "28 Mar – 5 Apr 2027", "28 Mar 2027 – 2 Jan 2028" or "5 Apr 2027". */
export function dateRange(first: string | null, last: string | null): string {
  if (!first || !last) return "";
  if (first === last) return fmt(first, { day: "numeric", month: "short", year: "numeric" });
  const sameYear = first.slice(0, 4) === last.slice(0, 4);
  return `${fmt(first, sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" })} – ${fmt(last, { day: "numeric", month: "short", year: "numeric" })}`;
}

/** A three-letter code for a stop, like an airport: "Uluwatu Temple" → "ULU". */
export function stopCode(title: string): string {
  const letters = title.normalize("NFKD").replace(/[^A-Za-z]/g, "");
  return (letters.slice(0, 3) || "HOP").toUpperCase();
}

/** Fits map points into a 0..1 box (keeping their shape), at most eight of them, for drawing hops. */
export function fitRoute(points: { lat: number; lon: number }[]): RoutePoints {
  if (points.length < 2) return [];
  const step = points.length > MAX_ROUTE_POINTS ? (points.length - 1) / (MAX_ROUTE_POINTS - 1) : 1;
  const picked = step === 1 ? points : Array.from({ length: MAX_ROUTE_POINTS }, (_, i) => points[Math.round(i * step)]!);
  const meanLat = picked.reduce((s, p) => s + p.lat, 0) / picked.length;
  const k = Math.cos((meanLat * Math.PI) / 180);
  const xy = picked.map((p) => [p.lon * k, -p.lat] as const);
  const xs = xy.map((p) => p[0]);
  const ys = xy.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY);
  if (span === 0) return [];
  const offX = (1 - (Math.max(...xs) - minX) / span) / 2;
  const offY = (1 - (Math.max(...ys) - minY) / span) / 2;
  return xy.map(([x, y]) => [0.08 + 0.84 * (offX + (x - minX) / span), 0.08 + 0.84 * (offY + (y - minY) / span)] as [number, number]);
}

export interface PosterDataOptions {
  kind: PosterKind;
  /** For a day card. */
  date?: string;
  tz: string;
  photos: (PhotoSource | null)[];
  showNames: boolean;
  showDates: boolean;
}

/** Turns a trip into what posters draw. Only group plans are used (see `tripRecap`); names are first names. */
export function posterData(snapshot: TripSnapshot, opts: PosterDataOptions): PosterData {
  const input: RecapInput = {
    items: snapshot.items,
    rsvps: snapshot.rsvps,
    members: snapshot.members,
    startDate: snapshot.trip.startDate,
    endDate: snapshot.trip.endDate,
    tz: opts.tz,
  };
  const recap = tripRecap(input);
  const dest = snapshot.trip.destination?.name.split(",")[0]?.trim() || snapshot.trip.name;
  const first = recap.firstDay;
  const year = first?.slice(0, 4) ?? "";
  const stampOf = (date: string | null) => (date ? `'${date.slice(2, 4)} ${date.slice(5, 7)} ${date.slice(8, 10)}` : "");
  const who = opts.showNames ? joinNames(recap.travellers) : "";
  const crew = recap.travellers.length;
  const allStops = recap.routes.flatMap((r) => r.stops);

  if (opts.kind === "day" && opts.date) {
    const day = dayRecap(input, opts.date);
    const dayStops = day.routes[0]?.stops ?? [];
    let km = 0;
    for (let i = 1; i < dayStops.length; i += 1) km += distanceKm(dayStops[i - 1]!, dayStops[i]!);
    const dayNo = first ? Math.round((parse(opts.date).getTime() - parse(first).getTime()) / 86_400_000) + 1 : 1;
    const firstStop = day.stops[0]?.title ?? dest;
    const lastStop = day.stops.at(-1)?.title ?? dest;
    return {
      kind: "day",
      title: `Day ${dayNo} in ${dest}`,
      dest,
      dates: opts.showDates ? `${fmt(opts.date, { weekday: "short" })} ${fmt(opts.date, { day: "numeric", month: "short", year: "numeric" })}` : "",
      short: fmt(opts.date, { day: "numeric", month: "short" }).toUpperCase(),
      year: opts.date.slice(0, 4),
      stats: [
        { n: day.plans, l: day.plans === 1 ? "stop" : "stops" },
        { n: Math.round(km), l: "km" },
        { n: crew, l: "going" },
      ],
      crew,
      stops: day.stops.slice(0, 3).map((s) => `${s.title} ${s.time}`),
      from: [stopCode(firstStop), firstStop],
      to: [stopCode(lastStop), lastStop],
      who,
      stamp: opts.showDates ? stampOf(opts.date) : "",
      fields: [
        ["DAY", String(dayNo)],
        ["STOPS", String(day.plans)],
        ["KM", String(Math.round(km))],
        ["CREW", String(crew)],
      ],
      route: fitRoute(dayStops),
      photos: opts.photos,
      showNames: opts.showNames,
      showDates: opts.showDates,
    };
  }

  const firstStop = allStops[0]?.title ?? dest;
  const lastStop = allStops.at(-1)?.title ?? dest;
  return {
    kind: "trip",
    title: snapshot.trip.name,
    dest,
    dates: opts.showDates ? dateRange(recap.firstDay, recap.lastDay) : "",
    short: first ? fmt(first, { month: "short", year: "numeric" }).toUpperCase() : "",
    year,
    stats: [
      { n: recap.days, l: recap.days === 1 ? "day" : "days" },
      { n: recap.places, l: recap.places === 1 ? "place" : "places" },
      { n: recap.distanceKm, l: "km hopped" },
    ],
    crew,
    stops: recap.topStops.map((s) => s.title),
    from: [stopCode(firstStop), firstStop],
    to: [stopCode(lastStop), lastStop],
    who,
    stamp: opts.showDates ? stampOf(first) : "",
    fields: [
      ["DAYS", String(recap.days)],
      ["PLACES", String(recap.places)],
      ["KM", String(recap.distanceKm)],
      ["CREW", String(crew)],
    ],
    route: fitRoute(allStops),
    photos: opts.photos,
    showNames: opts.showNames,
    showDates: opts.showDates,
  };
}
