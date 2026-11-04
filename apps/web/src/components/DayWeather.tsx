import { addDays, formatTime, type TripDestination } from "@hoppin/core";
import { CloudSun } from "lucide-react";
import { useEffect, useState } from "react";
import { useServices } from "../app/services";
import { FORECAST_DAYS, type WeatherResult } from "../providers/weather";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The first day the forecast can be shown for `date`, like "21 Nov". */
function opens(date: string): string {
  const day = addDays(date, -FORECAST_DAYS);
  return `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
}

/** The day's forecast at the trip's destination, under the day strip. Shows nothing when there is none to show. */
export function DayWeather({ destination, date }: { destination: TripDestination | null | undefined; date: string }) {
  const { weather, clock } = useServices();
  const [result, setResult] = useState<{ key: string; value: WeatherResult } | null>(null);
  const lat = destination?.lat;
  const lon = destination?.lon;
  const key = `${lat}|${lon}|${date}`;

  useEffect(() => {
    if (lat === undefined || lon === undefined) return;
    let alive = true;
    weather.forDay({ lat, lon }, date).then(
      (value) => alive && setResult({ key, value }),
      () => alive && setResult({ key, value: { status: "unavailable" } }),
    );
    return () => {
      alive = false;
    };
  }, [weather, lat, lon, date, key]);

  if (!destination || result?.key !== key || result.value.status === "unavailable") return null;
  const box = "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card bg-raised px-4 py-3 text-sm";
  if (result.value.status === "not-yet") {
    return (
      <section aria-label="Weather" className={`${box} text-muted`}>
        <CloudSun aria-hidden="true" className="size-5 shrink-0" />
        <span>
          Too early for a forecast. Weather for {destination.name} shows up here from {opens(date)}, {FORECAST_DAYS} days before this day.
        </span>
      </section>
    );
  }
  const { forecast, fetchedAt, old } = result.value;
  const updated = formatTime(new Date(fetchedAt).toISOString(), clock.timeZone);
  return (
    <section aria-label="Weather" className={box}>
      <CloudSun aria-hidden="true" className="size-5 shrink-0 text-muted" />
      <span className="font-semibold">
        {forecast.hi}° / {forecast.lo}°
      </span>
      <span>{forecast.summary}</span>
      <span className="text-muted">{destination.name}</span>
      <span className="text-xs text-muted">{old ? `Saved forecast, updated ${updated}` : `Updated ${updated}`}</span>
    </section>
  );
}
