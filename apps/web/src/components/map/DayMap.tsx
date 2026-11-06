import { formatTime, type DayStops, type Item } from "@hoppin/core";
import { useMemo, useState } from "react";
import { useThemeTick } from "../../hooks/useThemeTick";
import { dayColor } from "../../lib/map-colors";
import { MapFrame } from "./MapView";
import { findStop, pointsFor, withPlanLinks } from "./points";
import { StopSheet } from "./StopSheet";

export interface DayMapProps {
  day: DayStops;
  /** 0 for the trip's first day, so the colour matches the trip map. */
  dayIndex: number;
  tripId: string;
  online: boolean;
  items: Item[];
}

/** One day's pins, with the same stops listed underneath. */
export function DayMap({ day, dayIndex, tripId, online, items }: DayMapProps) {
  const theme = useThemeTick(); // redraw in the new colours when the theme changes
  const [selected, setSelected] = useState<string | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const { points: placed, lines } = useMemo(() => pointsFor([{ day, index: dayIndex }]), [day, dayIndex, theme]);
  const points = useMemo(() => withPlanLinks(placed, items, tripId), [placed, items, tripId]);
  const stop = findStop([day], opened);
  const color = dayColor(dayIndex);
  const link = items.find((item) => item.id === stop?.itemId)?.locationUrl ?? null;

  return (
    <div className="flex flex-col gap-3">
      <MapFrame points={points} lines={lines} height={320} cooperativeGestures online={online} selectedId={selected} onSelect={setSelected} />
      <ol aria-label="Stops" className="flex flex-col gap-2">
        {day.stops.map((entry) => (
          <li key={entry.itemId}>
            <button
              type="button"
              onClick={() => {
                const id = `${entry.date}:${entry.itemId}`;
                setSelected(id);
                setOpened(id);
              }}
              className="flex min-h-12 w-full items-center gap-3 rounded-2xl bg-surface px-3 text-left focus-visible:outline-2 focus-visible:outline-accent"
            >
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
        {day.stays.map((entry) => (
          <li key={entry.itemId}>
            <button type="button" onClick={() => {
              const id = `${entry.date}:${entry.itemId}`;
              setSelected(id);
              setOpened(id);
            }} className="flex min-h-12 w-full items-center gap-3 rounded-2xl bg-surface px-3 text-left font-semibold focus-visible:outline-2 focus-visible:outline-accent">
              {entry.title}
            </button>
          </li>
        ))}
      </ol>
      <StopSheet stop={stop} locationUrl={link} tripId={tripId} onClose={() => setOpened(null)} />
    </div>
  );
}
