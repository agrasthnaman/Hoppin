import { formatTime, safeWebUrl, type DayStops, type Item, type Stop } from "@hoppin/core";
import { dayColor, STAY_COLOR } from "../../lib/map-colors";
import type { MapLine, MapPoint } from "./MapView";

/** Numbered stops and house pins for the days being shown, plus one dashed line per day. */
export function pointsFor(days: { day: DayStops; index: number }[]): { points: MapPoint[]; lines: MapLine[] } {
  const points: MapPoint[] = [];
  const lines: MapLine[] = [];
  for (const { day, index } of days) {
    const color = dayColor(index);
    for (const stop of day.stops) points.push(pin(stop, "stop", color, index));
    for (const stay of day.stays) points.push(pin(stay, "stay", STAY_COLOR, index));
    if (day.stops.length >= 2) {
      lines.push({ color, day: index, coords: day.stops.map((stop) => [stop.place.lon, stop.place.lat]) });
    }
  }
  return { points, lines };
}

function pin(stop: Stop, kind: "stop" | "stay", color: string, day: number): MapPoint {
  return {
    id: `${stop.date}:${stop.itemId}`,
    lat: stop.place.lat,
    lon: stop.place.lon,
    title: stop.title,
    ...(stop.place.label ? { place: stop.place.label } : {}),
    time: formatTime(stop.startsAt, stop.tz),
    kind,
    day,
    plan: stop.kind,
    ...(kind === "stop" ? { order: stop.order } : {}),
    color,
  };
}

/** Adds the plan page and the directions link, so a pin's card can open them. */
export function withPlanLinks(points: MapPoint[], items: Item[], tripId: string): MapPoint[] {
  return points.map((point) => {
    const itemId = point.id.slice(point.id.indexOf(":") + 1);
    const item = items.find((entry) => entry.id === itemId);
    return { ...point, planHref: `/trips/${tripId}/items/${itemId}`, ...(safeWebUrl(item?.locationUrl) ? { directions: safeWebUrl(item?.locationUrl)! } : {}) };
  });
}

export function findStop(days: DayStops[], id: string | null): Stop | null {
  if (!id) return null;
  const [date, itemId] = id.split(":");
  for (const day of days) {
    if (date && day.date !== date) continue;
    const found = [...day.stops, ...day.stays].find((stop) => stop.itemId === itemId);
    if (found) return found;
  }
  return null;
}
