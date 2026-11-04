import type { TripDestination } from "@hoppin/core";

/** One day's forecast: highs and lows in °C and a short plain-words summary. */
export interface Forecast {
  hi: number;
  lo: number;
  summary: string;
}

export interface WeatherProvider {
  /** The forecast for a day (YYYY-MM-DD, the destination's own calendar day). Throws when it can't be had. */
  forecast(lat: number, lon: number, date: string): Promise<Forecast>;
}

export interface Geocoder {
  /** The best match for a place name, or null when there is none. Throws when the service can't be reached. */
  find(query: string): Promise<TripDestination | null>;
}

export class WeatherUnavailableError extends Error {
  override name = "WeatherUnavailableError";
}

/** Open-Meteo only forecasts this many days ahead (today counts as day 0). */
export const FORECAST_DAYS = 16;
const HOUR = 3_600_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const utcDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** WMO weather codes, as Open-Meteo reports them, in a few words. */
export function describeWeatherCode(code: number): string {
  if (code === 0) return "Clear";
  if (code === 1) return "Mostly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Showers";
  if (code === 85 || code === 86) return "Snow showers";
  if (code >= 95) return "Thunderstorms";
  return "Mixed weather";
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface OpenMeteoOptions {
  fetch?: Fetch;
  timeoutMs?: number;
  forecastUrl?: string;
  geocodeUrl?: string;
}

async function getJson(fetch: Fetch, url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new WeatherUnavailableError(`The weather service answered ${res.status}`);
    return await res.json();
  } catch (error) {
    if (error instanceof WeatherUnavailableError) throw error;
    throw new WeatherUnavailableError("Couldn't reach the weather service", { cause: error });
  } finally {
    clearTimeout(timer);
  }
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** Open-Meteo forecasts (free, no key). Only the coordinates of the destination and the date are sent. */
export function createOpenMeteoWeather({
  fetch = (url, init) => globalThis.fetch(url, init),
  timeoutMs = 8000,
  forecastUrl = "https://api.open-meteo.com/v1/forecast",
}: OpenMeteoOptions = {}): WeatherProvider {
  return {
    async forecast(lat, lon, date) {
      if (!finite(lat) || !finite(lon) || !DATE.test(date)) throw new RangeError("Not a place and day");
      const query = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lon),
        daily: "weather_code,temperature_2m_max,temperature_2m_min",
        timezone: "auto",
        start_date: date,
        end_date: date,
      });
      const body = (await getJson(fetch, `${forecastUrl}?${query}`, timeoutMs)) as {
        daily?: { weather_code?: unknown[]; temperature_2m_max?: unknown[]; temperature_2m_min?: unknown[] };
      };
      const code = body.daily?.weather_code?.[0];
      const hi = body.daily?.temperature_2m_max?.[0];
      const lo = body.daily?.temperature_2m_min?.[0];
      if (!finite(code) || !finite(hi) || !finite(lo)) throw new WeatherUnavailableError(`No forecast for ${date}`);
      return { hi: Math.round(hi), lo: Math.round(lo), summary: describeWeatherCode(code) };
    },
  };
}

/** Looks a place name up once (Open-Meteo geocoding, free, no key). Only the typed place name is sent. */
export function createOpenMeteoGeocoder({
  fetch = (url, init) => globalThis.fetch(url, init),
  timeoutMs = 8000,
  geocodeUrl = "https://geocoding-api.open-meteo.com/v1/search",
}: OpenMeteoOptions = {}): Geocoder {
  return {
    async find(query) {
      const name = query.trim();
      if (name.length < 2) return null;
      const params = new URLSearchParams({ name, count: "1", language: "en", format: "json" });
      const body = (await getJson(fetch, `${geocodeUrl}?${params}`, timeoutMs)) as {
        results?: { name?: unknown; country?: unknown; latitude?: unknown; longitude?: unknown }[];
      };
      const hit = body.results?.[0];
      if (!hit || typeof hit.name !== "string" || !finite(hit.latitude) || !finite(hit.longitude)) return null;
      const label = typeof hit.country === "string" && hit.country ? `${hit.name}, ${hit.country}` : hit.name;
      return { name: label, lat: hit.latitude, lon: hit.longitude };
    },
  };
}

export interface CachedForecast extends Forecast {
  fetchedAt: number;
}

export interface WeatherStore {
  get(key: string): CachedForecast | undefined;
  set(key: string, value: CachedForecast): void;
}

const STORE_KEY = "hoppin.weather";
const isCached = (v: unknown): v is CachedForecast =>
  typeof v === "object" && v !== null && finite((v as CachedForecast).hi) && finite((v as CachedForecast).lo) &&
  typeof (v as CachedForecast).summary === "string" && finite((v as CachedForecast).fetchedAt);

/** Saved forecasts in `storage` (localStorage by default; `null` keeps them in memory). Only the newest `limit` are kept. */
export function createWeatherStore(storage: Storage | null = defaultStorage(), limit = 60): WeatherStore {
  let saved: Map<string, CachedForecast> | null = null;
  const all = (): Map<string, CachedForecast> => {
    if (saved) return saved;
    saved = new Map();
    try {
      const raw = JSON.parse(storage?.getItem(STORE_KEY) ?? "{}") as Record<string, unknown>;
      for (const [key, value] of Object.entries(raw)) if (isCached(value)) saved.set(key, value);
    } catch {
      /* unreadable: start empty */
    }
    return saved;
  };
  return {
    get: (key) => all().get(key),
    set(key, value) {
      const map = all();
      map.delete(key);
      map.set(key, value);
      if (map.size > limit) {
        const oldest = [...map].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt).slice(0, map.size - limit);
        for (const [old] of oldest) map.delete(old);
      }
      try {
        storage?.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(map)));
      } catch {
        /* storage full or blocked: still cached for this visit */
      }
    },
  };
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export type WeatherResult =
  | { status: "ok"; forecast: Forecast; fetchedAt: number; /** A saved forecast shown because a fresh one couldn't be fetched. */ old: boolean }
  /** The day is further ahead than any forecast reaches. */
  | { status: "not-yet" }
  /** Nothing to show: a past day, or no connection and nothing saved. */
  | { status: "unavailable" };

export interface WeatherService {
  /** The forecast for a day at a place. Never throws: offline it falls back to what was saved. */
  forDay(place: Pick<TripDestination, "lat" | "lon">, date: string): Promise<WeatherResult>;
}

export interface WeatherServiceOptions {
  provider: WeatherProvider;
  store: WeatherStore;
  now?: () => number;
  /** How long a forecast is trusted before asking again. */
  refreshAfterMs?: number;
}

const addDaysUtc = (date: string, days: number) => utcDate(Date.parse(`${date}T00:00:00Z`) + days * 24 * HOUR);

/** Forecasts with a device cache, labelled with when they were fetched. */
export function createWeatherService({ provider, store, now = Date.now, refreshAfterMs = 3 * HOUR }: WeatherServiceOptions): WeatherService {
  const inFlight = new Map<string, Promise<WeatherResult>>();

  async function load(lat: number, lon: number, date: string): Promise<WeatherResult> {
    const key = `${lat.toFixed(2)},${lon.toFixed(2)}@${date}`;
    const saved = store.get(key);
    if (saved && now() - saved.fetchedAt < refreshAfterMs) {
      return { status: "ok", forecast: { hi: saved.hi, lo: saved.lo, summary: saved.summary }, fetchedAt: saved.fetchedAt, old: false };
    }
    try {
      const forecast = await provider.forecast(lat, lon, date);
      const fetchedAt = now();
      store.set(key, { ...forecast, fetchedAt });
      return { status: "ok", forecast, fetchedAt, old: false };
    } catch {
      if (saved) return { status: "ok", forecast: { hi: saved.hi, lo: saved.lo, summary: saved.summary }, fetchedAt: saved.fetchedAt, old: true };
      return { status: "unavailable" };
    }
  }

  return {
    async forDay({ lat, lon }, date) {
      if (!DATE.test(date) || !finite(lat) || !finite(lon)) return { status: "unavailable" };
      // The destination may be a day ahead of or behind UTC, so one day of slack is allowed on the past side.
      const today = utcDate(now());
      if (date < addDaysUtc(today, -1)) return { status: "unavailable" };
      if (date > addDaysUtc(today, FORECAST_DAYS)) return { status: "not-yet" };
      const key = `${lat}|${lon}|${date}`;
      let pending = inFlight.get(key);
      if (!pending) {
        pending = load(lat, lon, date).finally(() => inFlight.delete(key));
        inFlight.set(key, pending);
      }
      return pending;
    },
  };
}
