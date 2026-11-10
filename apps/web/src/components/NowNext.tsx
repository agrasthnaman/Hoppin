import { formatTimeRange, nowAndNext, planProgress, safeWebUrl, untilLabel, type Item } from "@hoppin/core";
import { BedDouble, Navigation } from "lucide-react";
import { Link } from "react-router";
import { cn } from "../lib/cn";

export interface NowNextProps {
  items: Item[];
  viewerId: string;
  /** The current moment, in milliseconds. */
  now: number;
  tripId: string;
}

function Directions({ item, onHero }: { item: Item; onHero?: boolean }) {
  const url = safeWebUrl(item.locationUrl);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex min-h-11 items-center gap-2 self-start rounded-full px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        onHero ? "bg-surface text-fg" : "bg-accent text-accent-fg",
      )}
    >
      <Navigation aria-hidden="true" className="size-4" />
      Get directions
    </a>
  );
}

/**
 * What is on right now, what comes next and where the group sleeps. Shown at the top of today's page on Days,
 * so the day opens on the answer to "what are we doing?".
 */
export function NowNext({ items, viewerId, now, tripId }: NowNextProps) {
  const { current, next, stay } = nowAndNext(items, viewerId, new Date(now));
  if (!current && !next && !stay) return null;
  const title = (item: Item) => (
    <Link to={`/trips/${tripId}/items/${item.id}`} className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      {item.title}
    </Link>
  );
  const range = (item: Item) => formatTimeRange(item.startsAt, item.endsAt, item.tz, item.endTz);

  return (
    <section aria-label="Right now" className="flex flex-col gap-3">
      {current ? (
        <div className="flex flex-col gap-2 rounded-card bg-hero p-5 text-hero-fg">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
            <span aria-hidden="true" className="relative flex size-2.5">
              <span className="absolute inline-flex size-full rounded-full bg-accent opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex size-2.5 rounded-full bg-accent" />
            </span>
            Happening now
          </p>
          <h2 className="page-title text-3xl">{title(current)}</h2>
          <p className="text-sm font-medium">{range(current)}</p>
          <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-hero-fg/25">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(planProgress(current, now) * 100)}%` }} />
          </div>
          <Directions item={current} onHero />
        </div>
      ) : next ? (
        <div className="flex flex-col gap-2 rounded-card bg-hero p-5 text-hero-fg">
          <p className="text-xs font-semibold uppercase tracking-[0.14em]">Up next · {untilLabel(Date.parse(next.startsAt) - now)}</p>
          <h2 className="page-title text-3xl">{title(next)}</h2>
          <p className="text-sm font-medium">{range(next)}</p>
          <Directions item={next} onHero />
        </div>
      ) : null}

      {current && next && (
        <p className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
          <span className="font-semibold text-accent">Then {untilLabel(Date.parse(next.startsAt) - now)}</span>{" "}
          <span className="font-semibold">{title(next)}</span> <span className="text-muted">· {range(next)}</span>
        </p>
      )}

      {stay && (
        <p className="flex items-center gap-3 rounded-2xl bg-highlight px-4 py-3 text-sm text-highlight-fg">
          <BedDouble aria-hidden="true" className="size-5 shrink-0" />
          <span className="min-w-0">
            <span className="block text-xs font-semibold uppercase tracking-[0.14em]">Tonight you're at</span>
            <span className="block font-semibold">{title(stay)}</span>
          </span>
        </p>
      )}
    </section>
  );
}
