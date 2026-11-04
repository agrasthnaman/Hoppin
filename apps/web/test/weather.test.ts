import { describe, expect, it, vi } from "vitest";
import {
  FORECAST_DAYS,
  createOpenMeteoGeocoder,
  createOpenMeteoWeather,
  createWeatherService,
  createWeatherStore,
  describeWeatherCode,
  type WeatherProvider,
} from "../src/providers/weather";

const NOW = Date.parse("2026-12-01T09:00:00Z");
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

describe("Open-Meteo forecast", () => {
  it("maps Open-Meteo output to highs, lows and a summary, asking only for one day at the place", async () => {
    const fetch = vi.fn((_url: string) => json({ daily: { time: ["2026-12-02"], weather_code: [2], temperature_2m_max: [31.4], temperature_2m_min: [22.6] } }));
    const forecast = await createOpenMeteoWeather({ fetch }).forecast(15.49, 73.83, "2026-12-02");
    expect(forecast).toEqual({ hi: 31, lo: 23, summary: "Partly cloudy" });
    const url = new URL(String(fetch.mock.calls[0]![0]));
    expect(url.origin + url.pathname).toBe("https://api.open-meteo.com/v1/forecast");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ latitude: "15.49", longitude: "73.83", start_date: "2026-12-02", end_date: "2026-12-02", timezone: "auto" });
    expect([...url.searchParams.keys()].sort()).toEqual(["daily", "end_date", "latitude", "longitude", "start_date", "timezone"]);
  });

  it("fails when the service errors or sends nothing usable", async () => {
    await expect(createOpenMeteoWeather({ fetch: () => json({}, 500) }).forecast(1, 1, "2026-12-02")).rejects.toThrow();
    await expect(createOpenMeteoWeather({ fetch: () => json({ daily: { weather_code: [] } }) }).forecast(1, 1, "2026-12-02")).rejects.toThrow();
    await expect(createOpenMeteoWeather({ fetch: () => Promise.reject(new TypeError("offline")) }).forecast(1, 1, "2026-12-02")).rejects.toThrow();
  });

  it("describes weather codes in a few words", () => {
    expect([0, 3, 45, 63, 73, 81, 95].map(describeWeatherCode)).toEqual(["Clear", "Overcast", "Fog", "Rain", "Snow", "Showers", "Thunderstorms"]);
  });
});

describe("Open-Meteo place lookup", () => {
  it("finds a place, sending only the typed name", async () => {
    const fetch = vi.fn((_url: string) => json({ results: [{ name: "Goa", country: "India", latitude: 15.49, longitude: 73.83 }] }));
    expect(await createOpenMeteoGeocoder({ fetch }).find(" Goa ")).toEqual({ name: "Goa, India", lat: 15.49, lon: 73.83 });
    expect(Object.fromEntries(new URL(String(fetch.mock.calls[0]![0])).searchParams)).toMatchObject({ name: "Goa", count: "10" });
  });

  it("picks the island people mean, not a small town that shares the name (Bali)", async () => {
    const fetch = () =>
      json({
        results: [
          { name: "Bāli", admin1: "West Bengal", country: "India", population: 296973, latitude: 22.65, longitude: 88.34 },
          { name: "Bali", admin1: "Bali", country: "Indonesia", population: 4225384, latitude: -8.34, longitude: 115.09 },
          { name: "Balikpapan", admin1: "East Kalimantan", country: "Indonesia", population: 695287, latitude: -1.27, longitude: 116.83 },
        ],
      });
    expect(await createOpenMeteoGeocoder({ fetch }).find("Bali")).toEqual({ name: "Bali, Indonesia", lat: -8.34, lon: 115.09 });
  });

  it("names the region when it tells places apart, so a wrong guess is easy to spot", async () => {
    const fetch = () => json({ results: [{ name: "Portland", admin1: "Oregon", country: "United States", population: 650000, latitude: 45.5, longitude: -122.6 }] });
    expect((await createOpenMeteoGeocoder({ fetch }).find("Portland"))?.name).toBe("Portland, Oregon, United States");
  });

  it("falls back to the top result when no name matches exactly", async () => {
    const fetch = () => json({ results: [{ name: "Calangute", admin1: "Goa", country: "India", latitude: 15.54, longitude: 73.76 }] });
    expect((await createOpenMeteoGeocoder({ fetch }).find("Calangut"))?.name).toBe("Calangute, Goa, India");
  });

  it("returns null when nothing matches or the text is too short, and throws when unreachable", async () => {
    expect(await createOpenMeteoGeocoder({ fetch: () => json({}) }).find("Nowhereville")).toBeNull();
    const fetch = vi.fn();
    expect(await createOpenMeteoGeocoder({ fetch }).find("G")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    await expect(createOpenMeteoGeocoder({ fetch: () => Promise.reject(new TypeError("offline")) }).find("Goa")).rejects.toThrow();
  });
});

describe("weather service", () => {
  const goa = { lat: 15.49, lon: 73.83 };
  const provider = (impl: WeatherProvider["forecast"]) => ({ forecast: vi.fn(impl) });
  const sunny = async () => ({ hi: 31, lo: 23, summary: "Clear" });

  it("fetches a forecast, labels it with its fetch time, and reuses it while fresh", async () => {
    const p = provider(sunny);
    let now = NOW;
    const service = createWeatherService({ provider: p, store: createWeatherStore(null), now: () => now });
    expect(await service.forDay(goa, "2026-12-02")).toEqual({ status: "ok", forecast: { hi: 31, lo: 23, summary: "Clear" }, fetchedAt: NOW, old: false });
    now += 60_000;
    expect(await service.forDay(goa, "2026-12-02")).toMatchObject({ fetchedAt: NOW, old: false });
    expect(p.forecast).toHaveBeenCalledTimes(1);
  });

  it("refreshes after a few hours", async () => {
    const p = provider(sunny);
    let now = NOW;
    const service = createWeatherService({ provider: p, store: createWeatherStore(null), now: () => now });
    await service.forDay(goa, "2026-12-02");
    now += 4 * 3_600_000;
    expect(await service.forDay(goa, "2026-12-02")).toMatchObject({ fetchedAt: now });
    expect(p.forecast).toHaveBeenCalledTimes(2);
  });

  it("offline, shows the saved forecast marked as old; with nothing saved, shows nothing", async () => {
    let now = NOW;
    let online = true;
    const p = provider(async () => {
      if (!online) throw new Error("offline");
      return sunny();
    });
    const service = createWeatherService({ provider: p, store: createWeatherStore(null), now: () => now });
    expect(await service.forDay(goa, "2026-12-03")).toMatchObject({ status: "ok", old: false });
    online = false;
    now += 5 * 3_600_000;
    expect(await service.forDay(goa, "2026-12-03")).toMatchObject({ status: "ok", old: true, fetchedAt: NOW });
    expect(await service.forDay(goa, "2026-12-04")).toEqual({ status: "unavailable" });
  });

  it("saved forecasts survive a restart", async () => {
    const storage = new Map<string, string>();
    const fake = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v) } as unknown as Storage;
    await createWeatherService({ provider: provider(sunny), store: createWeatherStore(fake), now: () => NOW }).forDay(goa, "2026-12-02");
    const offline = provider(async () => {
      throw new Error("offline");
    });
    const again = createWeatherService({ provider: offline, store: createWeatherStore(fake), now: () => NOW + 9 * 3_600_000 });
    expect(await again.forDay(goa, "2026-12-02")).toMatchObject({ status: "ok", old: true, fetchedAt: NOW });
  });

  it("days beyond the forecast range say not available yet, without asking", async () => {
    const p = provider(sunny);
    const service = createWeatherService({ provider: p, store: createWeatherStore(null), now: () => NOW });
    expect(FORECAST_DAYS).toBe(16);
    expect(await service.forDay(goa, "2026-12-17")).toMatchObject({ status: "ok" }); // 16 days ahead is the last forecast day
    expect(await service.forDay(goa, "2026-12-18")).toEqual({ status: "not-yet" });
    expect(await service.forDay(goa, "2027-03-01")).toEqual({ status: "not-yet" });
    expect(p.forecast).toHaveBeenCalledTimes(1);
  });

  it("past days show nothing and never call the service", async () => {
    const p = provider(sunny);
    const service = createWeatherService({ provider: p, store: createWeatherStore(null), now: () => NOW });
    expect(await service.forDay(goa, "2026-11-20")).toEqual({ status: "unavailable" });
    expect(p.forecast).not.toHaveBeenCalled();
  });

  it("the same place and day asked twice at once makes one request", async () => {
    const p = provider(sunny);
    const service = createWeatherService({ provider: p, store: createWeatherStore(null), now: () => NOW });
    await Promise.all([service.forDay(goa, "2026-12-02"), service.forDay(goa, "2026-12-02")]);
    expect(p.forecast).toHaveBeenCalledTimes(1);
  });
});
