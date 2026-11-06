import { formatTimeRange, type Stop } from "@hoppin/core";
import { Link } from "react-router";
import { KindTag } from "../kind";
import { Sheet } from "../ui/Sheet";

export interface StopSheetProps {
  stop: Stop | null;
  locationUrl: string | null;
  tripId: string;
  onClose: () => void;
}

/** A tapped pin: what it is, when, and how to get there. */
export function StopSheet({ stop, locationUrl, tripId, onClose }: StopSheetProps) {
  return (
    <Sheet open={stop !== null} onOpenChange={(open) => !open && onClose()} title={stop?.title ?? "Plan"}>
      {stop && (
        <div className="flex flex-col items-start gap-3">
          <KindTag kind={stop.kind} />
          <p className="font-display text-2xl font-extrabold">{stop.title}</p>
          <p>{formatTimeRange(stop.startsAt, stop.endsAt, stop.tz, stop.endTz)}</p>
          {stop.place.label && <p className="text-sm text-muted">{stop.place.label}</p>}
          {locationUrl && (
            <a href={locationUrl} className="font-semibold text-link focus-visible:outline-2 focus-visible:outline-accent">
              Get directions
            </a>
          )}
          <Link
            to={`/trips/${tripId}/items/${stop.itemId}`}
            className="inline-flex min-h-11 items-center rounded-full bg-accent px-4 font-semibold text-accent-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Open plan
          </Link>
        </div>
      )}
    </Sheet>
  );
}
