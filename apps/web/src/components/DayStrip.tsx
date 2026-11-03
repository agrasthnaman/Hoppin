import { addDays } from "@hoppin/core";
import { m } from "motion/react";
import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { cn } from "../lib/cn";
import { spring } from "../lib/motion";

export interface DayStripProps {
  /** The trip's first and last day (`YYYY-MM-DD`). Without both, nothing is shown. */
  start: string | null;
  end: string | null;
  selected: string;
}

const MAX_PILLS = 31;
const weekday = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short" });
const longDate = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
const at = (date: string) => new Date(`${date}T12:00:00Z`);

/** The days of the trip as a row of pills. The selected day gets the pop colour. */
export function DayStrip({ start, end, selected }: DayStripProps) {
  const current = useRef<HTMLAnchorElement | null>(null);
  useEffect(() => {
    current.current?.scrollIntoView?.({ inline: "center", block: "nearest" });
  }, [selected]);

  if (!start || !end || end < start) return null;
  let days: string[] = [];
  for (let d = start; d <= end && days.length < 400; d = addDays(d, 1)) days.push(d);
  if (days.length > MAX_PILLS) {
    // a very long trip: show a window around the selected day
    const i = Math.max(0, days.indexOf(selected));
    const from = Math.min(Math.max(0, i - 15), days.length - MAX_PILLS);
    days = days.slice(from, from + MAX_PILLS);
  }
  if (!days.includes(selected)) days = [...days, selected].sort();

  return (
    <nav aria-label="Days of the trip" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
      {days.map((day) => {
        const isSelected = day === selected;
        return (
          <Link
            key={day}
            ref={isSelected ? current : undefined}
            to={{ search: `?date=${day}` }}
            aria-label={longDate.format(at(day))}
            aria-current={isSelected ? "date" : undefined}
            className={cn(
              "relative flex min-w-14 shrink-0 flex-col items-center rounded-2xl px-3 py-2 text-xs font-semibold transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              isSelected ? "bg-accent-soft text-accent-fg" : "bg-accent-soft text-accent-soft-fg hover:brightness-95",
            )}
          >
            {isSelected && <m.span layoutId="day-pill" transition={spring} className="absolute inset-0 rounded-2xl bg-accent" />}
            <span className="relative">{weekday.format(at(day))}</span>
            <span className="relative font-display text-lg font-extrabold leading-none">{Number(day.slice(8, 10))}</span>
          </Link>
        );
      })}
    </nav>
  );
}
