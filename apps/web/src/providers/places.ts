import { isValidPlace, roundPlace, type Place } from "@hoppin/core";

/** One search hit: the pin, and the city line shown under the name. */
export interface PlaceHit {
  place: Place;
  detail: string;
}

export type PlaceSearch = { status: "ok"; results: PlaceHit[] } | { status: "offline" } | { status: "failed" };

export interface PlacesApi {
  searchPlaces(query: string, options?: { near?: { lat: number; lon: number }; signal?: AbortSignal }): Promise<PlaceSearch>;
  reversePlace(at: { lat: number; lon: number }): Promise<string | null>;
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const SEARCH = "https://photon.komoot.io/api/";
const REVERSE = "https://photon.komoot.io/reverse";

function detailOf(properties: Record<string, unknown>): string {
  const parts = [properties.city, properties.state, properties.country].filter((part): part is string => typeof part === "string" && part.trim() !== "");
  return [...new Set(parts.map((part) => part.trim()))].join(", ");
}

function labelOf(properties: Record<string, unknown>): string {
  if (typeof properties.name === "string" && properties.name.trim()) return properties.name.trim();
  const street = typeof properties.street === "string" ? properties.street.trim() : "";
  const number = typeof properties.housenumber === "string" ? properties.housenumber.trim() : "";
  return [street, number].filter(Boolean).join(" ");
}

function hitsFrom(body: unknown): PlaceHit[] {
  const features = body && typeof body === "object" && Array.isArray((body as { features?: unknown }).features) ? (body as { features: unknown[] }).features : [];
  const hits: PlaceHit[] = [];
  for (const feature of features) {
    if (!feature || typeof feature !== "object") continue;
    const geometry = (feature as { geometry?: { coordinates?: unknown } }).geometry;
    const coordinates = geometry?.coordinates;
    const properties = (feature as { properties?: Record<string, unknown> }).properties ?? {};
    if (!Array.isArray(coordinates) || coordinates.length < 2) continue;
    const lon = coordinates[0];
    const lat = coordinates[1];
    if (!isValidPlace({ lat, lon })) continue;
    const label = labelOf(properties);
    hits.push({ place: roundPlace(label ? { lat: lat as number, lon: lon as number, label } : { lat: lat as number, lon: lon as number }), detail: detailOf(properties) });
  }
  return hits;
}

/** Photon search and reverse geocoding. Expected failures come back as a status, not a throw. */
export function createPhotonPlaces({
  fetch = (url, init) => globalThis.fetch(url, init),
  timeoutMs = 8000,
  online = () => (typeof navigator === "undefined" ? true : navigator.onLine),
}: { fetch?: Fetch; timeoutMs?: number; online?: () => boolean } = {}): PlacesApi {
  const cache = new Map<string, PlaceHit[]>();

  async function get(url: string, signal?: AbortSignal): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort);
    try {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(String(response.status));
      return await response.json();
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  return {
    async searchPlaces(query, options) {
      const text = query.trim();
      if (text.length < 3) return { status: "ok", results: [] };
      if (!online()) return { status: "offline" };
      const key = text.toLowerCase();
      const cached = cache.get(key);
      if (cached) return { status: "ok", results: cached };
      const url = new URL(SEARCH);
      url.searchParams.set("q", text);
      url.searchParams.set("limit", "6");
      url.searchParams.set("lang", "en");
      if (options?.near && isValidPlace(options.near)) {
        url.searchParams.set("lat", String(options.near.lat));
        url.searchParams.set("lon", String(options.near.lon));
      }
      try {
        const results = hitsFrom(await get(url.toString(), options?.signal)).slice(0, 6);
        cache.set(key, results);
        if (cache.size > 20) {
          const oldest = cache.keys().next().value;
          if (oldest) cache.delete(oldest);
        }
        return { status: "ok", results };
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        return { status: "failed" };
      }
    },
    async reversePlace(at) {
      if (!online() || !isValidPlace(at)) return null;
      const url = new URL(REVERSE);
      url.searchParams.set("lat", String(at.lat));
      url.searchParams.set("lon", String(at.lon));
      url.searchParams.set("lang", "en");
      try {
        const hits = hitsFrom(await get(url.toString()));
        return hits[0]?.place.label ?? null;
      } catch {
        return null;
      }
    },
  };
}

const DEMO: PlaceHit[] = [
  { place: { lat: 15.4989, lon: 73.8278, label: "Panjim" }, detail: "Goa, India" },
  { place: { lat: 15.5439, lon: 73.7553, label: "Calangute" }, detail: "Goa, India" },
  { place: { lat: 15.4922, lon: 73.7737, label: "Fort Aguada" }, detail: "Goa, India" },
  { place: { lat: 15.5553, lon: 73.7517, label: "Baga" }, detail: "Goa, India" },
  { place: { lat: -8.3405, lon: 115.092, label: "Bali" }, detail: "Indonesia" },
  { place: { lat: -8.5069, lon: 115.2625, label: "Ubud" }, detail: "Bali, Indonesia" },
  { place: { lat: -8.8291, lon: 115.0849, label: "Uluwatu" }, detail: "Bali, Indonesia" },
  { place: { lat: -8.6907, lon: 115.1682, label: "Seminyak" }, detail: "Bali, Indonesia" },
  { place: { lat: -8.6478, lon: 115.1385, label: "Canggu" }, detail: "Bali, Indonesia" },
];

function cannedMatch(hit: PlaceHit, text: string): boolean {
  const label = hit.place.label?.toLowerCase() ?? "";
  if (!label) return false;
  if (label.includes(text) || text.includes(label)) return true;
  return text.split(/\s+/).some((word) => word.length >= 3 && label.includes(word));
}

function cannedPlaces(): PlacesApi {
  return {
    async searchPlaces(query) {
      const text = query.trim().toLowerCase();
      if (text.length < 3) return { status: "ok", results: [] };
      return { status: "ok", results: DEMO.filter((hit) => cannedMatch(hit, text)).slice(0, 6) };
    },
    async reversePlace(at) {
      const nearest = DEMO.slice().sort((a, b) => Math.hypot(a.place.lat - at.lat, a.place.lon - at.lon) - Math.hypot(b.place.lat - at.lat, b.place.lon - at.lon))[0];
      return nearest?.place.label ?? null;
    },
  };
}

/**
 * Sample-trip search. With a live search, that is used when it returns places.
 * The built-in list covers the sample trip when there is no connection.
 */
export function createDemoPlaces(live?: PlacesApi): PlacesApi {
  const canned = cannedPlaces();
  if (!live) return canned;
  return {
    async searchPlaces(query, options) {
      try {
        const result = await live.searchPlaces(query, options);
        if (result.status === "ok" && result.results.length > 0) return result;
        const backup = await canned.searchPlaces(query, options);
        if (backup.status === "ok" && backup.results.length > 0) return backup;
        return result;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        return canned.searchPlaces(query, options);
      }
    },
    async reversePlace(at) {
      try {
        const label = await live.reversePlace(at);
        if (label) return label;
      } catch {
        // the sample list still has a nearby name
      }
      return canned.reversePlace(at);
    },
  };
}
