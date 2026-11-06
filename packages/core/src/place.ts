import type { Place } from "./types";

export type { Place };

const COORD = "-?\\d+(?:\\.\\d+)?";
const PAIR = new RegExp(`^(${COORD})\\s*,\\s*(${COORD})$`);

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** A place we are willing to store: finite, on the earth, and not the empty (0, 0) pin. */
export function isValidPlace(value: unknown): value is Place {
  if (!value || typeof value !== "object") return false;
  const lat = (value as { lat?: unknown }).lat;
  const lon = (value as { lon?: unknown }).lon;
  if (typeof lat !== "number" || typeof lon !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
  if (lat === 0 && lon === 0) return false;
  return true;
}

/** Coordinates rounded to 6 decimals. The label is kept when it is a non-empty string. */
export function roundPlace(place: Place): Place {
  const label = typeof place.label === "string" ? place.label.trim() : "";
  const rounded: Place = { lat: round6(place.lat), lon: round6(place.lon) };
  if (label) rounded.label = label;
  return rounded;
}

function pair(latRaw: string, lonRaw: string, label?: string): Place | null {
  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  if (!isValidPlace({ lat, lon })) return null;
  return roundPlace(label ? { lat, lon, label } : { lat, lon });
}

function parsePair(text: string): { lat: string; lon: string } | null {
  const match = PAIR.exec(text.trim());
  return match ? { lat: match[1] ?? "", lon: match[2] ?? "" } : null;
}

function decodeLabel(raw: string): string {
  const spaced = raw.replace(/\+/g, " ");
  try {
    return decodeURIComponent(spaced).trim();
  } catch {
    return spaced.trim();
  }
}

function googlePlaceLabel(pathname: string): string | undefined {
  const match = /\/place\/([^/@]+)/.exec(pathname);
  if (!match?.[1]) return undefined;
  const label = decodeLabel(match[1]);
  if (!label || parsePair(label)) return undefined;
  return label;
}

function nameFromQuery(value: string | null): string | undefined {
  if (!value) return undefined;
  const label = decodeLabel(value);
  if (!label || parsePair(label)) return undefined;
  return label;
}

/** The first coordinates found in a map link, or null. Never throws. */
export function placeFromUrl(url: string): Place | null {
  try {
    if (!url || url.length > 10_000) return null;
    const trimmed = url.trim();
    if (!trimmed || /^javascript:/i.test(trimmed)) return null;
    if (/^https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(trimmed)) return null;

    const geo = new RegExp(`^geo:(${COORD}),(${COORD})(?:[,;].*)?$`, "i").exec(trimmed);
    if (geo) return pair(geo[1] ?? "", geo[2] ?? "");

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return null;
    }

    const pin = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(`${parsed.pathname}${parsed.search}${parsed.hash}`);
    if (pin) return pair(pin[1] ?? "", pin[2] ?? "", googlePlaceLabel(parsed.pathname));

    const at = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(parsed.href);
    if (at) return pair(at[1] ?? "", at[2] ?? "", googlePlaceLabel(parsed.pathname));

    const ll = parsed.searchParams.get("ll");
    const llPair = ll ? parsePair(ll) : null;
    if (llPair) return pair(llPair.lat, llPair.lon, nameFromQuery(parsed.searchParams.get("q")));

    for (const key of ["q", "query", "destination", "sll"] as const) {
      const raw = parsed.searchParams.get(key);
      const found = raw ? parsePair(raw) : null;
      if (found) return pair(found.lat, found.lon);
    }

    const mlat = parsed.searchParams.get("mlat");
    const mlon = parsed.searchParams.get("mlon");
    if (mlat && mlon) {
      const found = pair(mlat, mlon);
      if (found) return found;
    }

    const hash = /#map=\d+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/.exec(parsed.hash);
    if (hash) return pair(hash[1] ?? "", hash[2] ?? "");

    return null;
  } catch {
    return null;
  }
}

function storedPlace(value: unknown): Place | null {
  if (!isValidPlace(value)) return null;
  const label = typeof value.label === "string" ? value.label : undefined;
  return roundPlace(label ? { lat: value.lat, lon: value.lon, label } : { lat: value.lat, lon: value.lon });
}

/** The place on an item: the saved pin, or coordinates read from its map link. */
export function itemPlace(item: { details: Record<string, unknown>; locationUrl: string | null }): Place | null {
  return storedPlace(item.details.place) ?? (item.locationUrl ? placeFromUrl(item.locationUrl) : null);
}

/** Kilometres between two places (haversine). */
export function distanceKm(a: Place, b: Place): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
