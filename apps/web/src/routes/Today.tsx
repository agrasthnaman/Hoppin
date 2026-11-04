import { formatTimeRange, nowAndNext, type Item } from "@hoppin/core";
import { MapPin } from "lucide-react";
import { Link } from "react-router";
import { useServices } from "../app/services";
import { tripGate, useTripData } from "../app/trip-data";
import { PageHeading } from "../components/PageHeading";

function notesOf(item: Item): string {
  return typeof item.details.notes === "string" ? item.details.notes : "";
}

function MapLink({ href, onHero }: { href: string; onHero?: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={
        onHero
          ? "inline-flex min-h-11 items-center gap-2 self-start rounded-full bg-surface px-4 text-sm font-semibold text-fg"
          : "inline-flex min-h-11 items-center gap-2 self-start rounded-full bg-accent px-4 text-sm font-semibold text-accent-fg"
      }
    >
      <MapPin aria-hidden="true" className="size-4" />
      Open in Maps
    </a>
  );
}

function Plan({
  label,
  item,
  tripId,
  className,
  onHero,
}: {
  label: string;
  item: Item;
  tripId: string;
  className: string;
  onHero?: boolean;
}) {
  const notes = notesOf(item);
  return (
    <section aria-label={label} className={`flex flex-col gap-2 rounded-card p-5 ${className}`}>
      <p className="border-b border-dashed border-current/25 pb-2 text-xs font-semibold uppercase tracking-[0.14em]">{label}</p>
      <h2 className="page-title text-4xl">
        <Link to={`/trips/${tripId}/items/${item.id}`} className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          {item.title}
        </Link>
      </h2>
      <p className="text-sm font-medium">{formatTimeRange(item.startsAt, item.endsAt, item.tz, item.endTz)}</p>
      {notes && <p className="text-sm">{notes}</p>}
      {item.locationUrl && <MapLink href={item.locationUrl} onHero={onHero} />}
    </section>
  );
}

/** Now, next, and where the group is staying. Read from the copy of the trip already on this device. */
export default function Today() {
  const trip = useTripData();
  const { clock } = useServices();
  const gate = tripGate(trip);
  if (gate || !trip.snapshot) return gate;

  const now = new Date(clock.now());
  const { current, next, stay } = nowAndNext(trip.snapshot.items, trip.viewerId, now);
  const dateLine = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: clock.timeZone,
  }).format(now);

  return (
    <div className="flex flex-col gap-4 pb-24">
      <PageHeading
        title="Today"
        date={dateLine}
        aside={
          <Link to="/trips" className="text-sm font-semibold text-link focus-visible:outline-2 focus-visible:outline-accent">
            All trips
          </Link>
        }
      />

      {current ? (
        <Plan label="Now" item={current} tripId={trip.tripId} onHero className="bg-hero text-hero-fg" />
      ) : (
        <section aria-label="Now" className="rounded-card border border-line bg-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Now</p>
          <p className="page-title mt-2 text-3xl">Nothing on right now</p>
        </section>
      )}

      {next ? (
        <Plan label="Next" item={next} tripId={trip.tripId} className="border border-line bg-surface text-fg" />
      ) : (
        <section aria-label="Next" className="rounded-card border border-line bg-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Next</p>
          <p className="mt-2 text-muted">Nothing else planned.</p>
        </section>
      )}

      {stay && (
        <Plan label="Where you're staying" item={stay} tripId={trip.tripId} className="bg-highlight text-highlight-fg" />
      )}
    </div>
  );
}
