import type { DayStops } from "@hoppin/core";
import { ArrowRight, Map as MapIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useThemeTick } from "../../hooks/useThemeTick";
import { dayColor } from "../../lib/map-colors";
import { MapFrame, mapCanDraw } from "./MapView";
import { pointsFor } from "./points";

export interface DayGlanceProps {
  day: DayStops;
  /** 0 for the trip's first day, so the colours match the trip map. */
  dayIndex: number;
  tripId: string;
  online: boolean;
}

/**
 * A small look at the day's route, right on the day plan: pins and the hops between them. It only looks.
 * Tapping it opens the Map tab on this day. With no connection it shows the stops as a ribbon instead.
 */
export function DayGlance({ day, dayIndex, tripId, online }: DayGlanceProps) {
  const theme = useThemeTick(); // redraw in the new colours when the theme changes
  const [gl] = useState(mapCanDraw);
  const [failed, setFailed] = useState(false);
  const { points, lines } = useMemo(() => pointsFor([{ day, index: dayIndex }]), [day, dayIndex, theme]);
  const color = dayColor(dayIndex);
  const count = day.stops.length;
  const first = day.stops[0]?.title;
  const last = day.stops[count - 1]?.title;
  const summary = count === 0 ? "Where you're staying" : count === 1 ? "1 stop" : `${count} stops`;
  const showMap = online && gl && !failed && points.length > 0;

  return (
    <Link
      to={`/trips/${tripId}/map?day=${day.date}`}
      aria-label={`Open the map for this day. ${summary}`}
      className="group relative block overflow-hidden rounded-card shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {showMap ? (
        <MapFrame points={points} lines={lines} height={176} online={online} interactive={false} tilt={35} selectedId={null} onSelect={() => {}} />
      ) : (
        <div className="flex h-44 flex-wrap content-center items-center gap-2 bg-hero p-4 pb-14 text-hero-fg" aria-hidden="true">
          {day.stops.slice(0, 6).map((stop) => (
            <span key={stop.itemId} className="inline-flex items-center gap-2 rounded-full bg-white/15 py-1 pl-1 pr-3 text-sm font-semibold">
              <span className="inline-flex size-6 items-center justify-center rounded-full text-xs font-black text-white ring-2 ring-white" style={{ backgroundColor: color }}>
                {stop.order}
              </span>
              <span className="max-w-[9rem] truncate">{stop.title}</span>
            </span>
          ))}
        </div>
      )}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-black/70 via-black/35 to-transparent p-3 pt-8 text-white">
        <span className="flex min-w-0 items-center gap-2">
          <MapIcon aria-hidden="true" className="size-4 shrink-0" />
          <span className="min-w-0 truncate text-sm font-bold">
            {summary}
            {count > 1 && first && last ? ` · ${first} → ${last}` : ""}
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-black transition-transform group-hover:translate-x-0.5">
          Open map
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </span>
      </span>
    </Link>
  );
}
