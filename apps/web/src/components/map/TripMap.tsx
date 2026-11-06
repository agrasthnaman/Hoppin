import { formatTime, untilLabel, type DayStops, type Item, type Stop } from "@hoppin/core";
import { Navigation, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { cn } from "../../lib/cn";
import { useThemeTick } from "../../hooks/useThemeTick";
import { legsFor, totalMs } from "../../lib/map-arc";
import { dayColor } from "../../lib/map-colors";
import { Card } from "../ui/Card";
import { MapFrame } from "./MapView";
import { findStop, pointsFor, withPlanLinks } from "./points";
import { StopSheet } from "./StopSheet";

const chip = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });

export function dayChip(date: string): string {
  const parts = chip.formatToParts(new Date(`${date}T12:00:00Z`));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("weekday")} ${value("day")} ${value("month")}`;
}

export interface TripMapProps {
  days: DayStops[];
  items: Item[];
  tripId: string;
  online: boolean;
  /** The current moment and today's date, to open on today's stops and name the next stop. Both are optional. */
  now?: number;
  today?: string;
  /** A day to open on (from the preview on the day plan). Wins over today. */
  initialDay?: string;
}

/** The earliest placed stop that has not started yet. */
function upNext(days: DayStops[], now: number): Stop | null {
  let best: Stop | null = null;
  for (const day of days) {
    for (const stop of day.stops) {
      const at = Date.parse(stop.startsAt);
      if (at > now && (!best || at < Date.parse(best.startsAt))) best = stop;
    }
  }
  return best;
}

/** The whole trip: a pin per placed plan, one colour per day, and the same list beside it. */
export function TripMap({ days, items, tripId, online, now, today, initialDay }: TripMapProps) {
  const theme = useThemeTick(); // redraw in the new colours when the theme changes
  // During the trip the map opens on today's stops. Otherwise it shows every day.
  const [which, setWhich] = useState<string>(() => {
    const asked = initialDay ? days.find((entry) => entry.date === initialDay) : undefined;
    if (asked) return asked.date;
    const day = today ? days.find((entry) => entry.date === today) : undefined;
    return day && day.stops.length + day.stays.length > 0 ? day.date : "all";
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  // "Play trip": every day's route draws one after another, with the camera following.
  const [playKey, setPlayKey] = useState(0);
  const [playing, setPlaying] = useState(false);
  const playTimer = useRef<number | null>(null);
  useEffect(() => () => void (playTimer.current !== null && window.clearTimeout(playTimer.current)), []);
  const shown = which === "all" ? days : days.filter((day) => day.date === which);
  const indexed = useMemo(
    () => shown.map((day) => ({ day, index: days.findIndex((entry) => entry.date === day.date) })),
    [days, shown],
  );
  const drawn = useMemo(() => pointsFor(indexed), [indexed, theme]);
  const points = useMemo(() => withPlanLinks(drawn.points, items, tripId), [drawn.points, items, tripId]);
  const lines = drawn.lines;
  const playable = days.reduce((total, day) => total + day.stops.length, 0) >= 2;
  const playMs = days.reduce((total, day) => total + (day.stops.length >= 2 ? totalMs(legsFor(day.stops.map((stop) => [stop.place.lon, stop.place.lat]))) + 500 : 0), 0) + 1600;
  function play() {
    setWhich("all");
    setSelected(null);
    setOpened(null);
    setPlayKey((key) => key + 1);
    setPlaying(true);
    if (playTimer.current !== null) window.clearTimeout(playTimer.current);
    playTimer.current = window.setTimeout(() => setPlaying(false), playMs);
  }
  const upcoming = now ? upNext(days, now) : null;
  const placed = days.some((day) => day.stops.length > 0 || day.stays.length > 0);
  const stop = findStop(days, opened);
  const link = items.find((item) => item.id === stop?.itemId)?.locationUrl ?? null;
  const unplaced = new Map<string, Item>();
  for (const day of shown) for (const item of day.unplaced) unplaced.set(item.id, item);

  if (!placed) {
    return (
      <Card className="flex flex-col items-start gap-3">
        <p>Add places to your plans to see them here.</p>
        <Link to={`/trips/${tripId}/days`} className="inline-flex min-h-11 items-center rounded-full bg-accent px-4 font-semibold text-accent-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          Days
        </Link>
      </Card>
    );
  }

  const quiet = "min-h-11 shrink-0 rounded-full bg-raised px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-accent";
  const on = "min-h-11 shrink-0 rounded-full bg-accent px-3 text-sm font-semibold text-accent-fg focus-visible:outline-2 focus-visible:outline-accent";

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Days" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        <button type="button" aria-pressed={which === "all"} className={which === "all" ? on : quiet} onClick={() => setWhich("all")}>
          All days
        </button>
        {days.map((day, index) => (
          <button key={day.date} type="button" aria-pressed={which === day.date} className={cn(which === day.date ? on : quiet, "inline-flex items-center gap-2")} onClick={() => setWhich(day.date)}>
            <span aria-hidden="true" className="size-2.5 rounded-full ring-2 ring-white" style={{ backgroundColor: dayColor(index) }} />
            {day.date === today ? "Today" : `Day ${index + 1} · ${dayChip(day.date)}`}
          </button>
        ))}
      </div>
      {points.length > 0 && (
        <div className="relative overflow-hidden rounded-card shadow-card">
          <MapFrame points={points} lines={lines} height="60dvh" tilt={30} playKey={playKey} online={online} selectedId={selected} onSelect={setSelected} />
          {online && playable && (
            <button
              type="button"
              onClick={play}
              disabled={playing}
              aria-label={playing ? "Playing the trip" : "Play the trip"}
              className="absolute left-3 top-3 z-10 inline-flex min-h-11 items-center gap-2 rounded-full bg-surface px-4 text-sm font-bold text-fg shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-80"
            >
              <Play aria-hidden="true" className="size-4 fill-current" />
              {playing ? "Playing…" : "Play trip"}
            </button>
          )}
        </div>
      )}
      {upcoming && (
        <div aria-label="Next stop" role="group" className="flex flex-wrap items-center gap-3 rounded-card bg-hero p-4 text-hero-fg">
          <span aria-hidden="true" className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-base font-bold text-white ring-2 ring-white" style={{ backgroundColor: dayColor(days.findIndex((entry) => entry.date === upcoming.date)) }}>
            {upcoming.order}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-hero-muted">Next stop · {untilLabel(Date.parse(upcoming.startsAt) - (now ?? 0))}</span>
            <span className="block truncate font-display text-xl font-extrabold">{upcoming.title}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              const id = `${upcoming.date}:${upcoming.itemId}`;
              setWhich(upcoming.date);
              setSelected(id);
              setOpened(id);
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-surface px-4 text-sm font-semibold text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Navigation aria-hidden="true" className="size-4" />
            Show
          </button>
        </div>
      )}
      {shown.map((day) => {
        const index = days.findIndex((entry) => entry.date === day.date);
        const color = dayColor(index);
        if (day.stops.length === 0 && day.stays.length === 0) return null;
        return (
          <section key={day.date} aria-label={`Day ${index + 1}`} className="flex flex-col gap-2">
            <h3 className="font-semibold">Day {index + 1} · {dayChip(day.date)}</h3>
            <ol className="flex flex-col gap-2">
              {day.stops.map((entry) => (
                <li key={entry.itemId}>
                  <button type="button" onClick={() => {
                    const id = `${entry.date}:${entry.itemId}`;
                    setSelected(id);
                    setOpened(id);
                  }} className="flex min-h-12 w-full items-center gap-3 rounded-2xl bg-surface px-3 text-left focus-visible:outline-2 focus-visible:outline-accent">
                    <span aria-hidden="true" className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: color }}>
                      {entry.order}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold">{entry.title}</span>
                      <span className="block text-sm text-muted">{formatTime(entry.startsAt, entry.tz)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
      {unplaced.size > 0 && (
        <details className="rounded-2xl bg-raised px-4 py-3">
          <summary className="cursor-pointer font-semibold">
            {unplaced.size === 1 ? "1 plan has no place yet" : `${unplaced.size} plans have no place yet`}
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {[...unplaced.values()].map((item) => (
              <li key={item.id}>
                <Link to={`/trips/${tripId}/items/${item.id}`} className="font-semibold text-link focus-visible:outline-2 focus-visible:outline-accent">
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
      <StopSheet stop={stop} locationUrl={link} tripId={tripId} onClose={() => setOpened(null)} />
    </div>
  );
}
