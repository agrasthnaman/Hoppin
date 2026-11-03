import { addDays, buildDay, defaultDay, localDate, nextBlock } from "@hoppin/core";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { goingFrom, peopleFrom } from "../app/people";
import { useServices } from "../app/services";
import { tripGate, useTripData } from "../app/trip-data";
import { DayStrip } from "../components/DayStrip";
import { DayView } from "../components/DayView";
import { ItemForm } from "../components/ItemForm";
import { Button } from "../components/ui/Button";
import { Sheet } from "../components/ui/Sheet";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** One day of the trip: a strip of day pills, the plans (the one happening now or next is spotlighted), RSVPs, adding a plan. */
export function DaysScreen() {
  const trip = useTripData();
  const { clock } = useServices();
  const [params] = useSearchParams();
  const [adding, setAdding] = useState(false);

  const gate = tripGate(trip);
  if (gate || !trip.snapshot) return gate;
  const { snapshot } = trip;

  const requested = params.get("date");
  const date = requested && DATE.test(requested) ? requested : defaultDay(snapshot.trip, clock.now(), clock.timeZone);
  const layout = buildDay(snapshot.items, trip.viewerId, date, clock.timeZone);
  const hasDates = Boolean(snapshot.trip.startDate && snapshot.trip.endDate);
  const now = clock.now();
  const highlightId =
    date === localDate(now, clock.timeZone)
      ? nextBlock(layout.blocks, now)
      : (layout.blocks.find((b) => b.kind !== "stay") ?? layout.blocks[0])?.id ?? null;

  const arrow = "inline-flex size-11 items-center justify-center rounded-full bg-raised hover:brightness-95 focus-visible:outline-2 focus-visible:outline-accent";
  return (
    <div className="flex flex-col gap-4">
      {hasDates ? (
        <DayStrip start={snapshot.trip.startDate} end={snapshot.trip.endDate} selected={date} />
      ) : (
        <div className="flex items-center justify-between">
          <Link to={{ search: `?date=${addDays(date, -1)}` }} aria-label="Previous day" className={arrow}>
            <ChevronLeft aria-hidden="true" className="size-5" />
          </Link>
          <Link to={{ search: `?date=${addDays(date, 1)}` }} aria-label="Next day" className={arrow}>
            <ChevronRight aria-hidden="true" className="size-5" />
          </Link>
        </div>
      )}

      <DayView
        date={date}
        tz={clock.timeZone}
        layout={layout}
        people={peopleFrom(snapshot.members)}
        viewerId={trip.viewerId}
        goingByItem={goingFrom(snapshot.rsvps)}
        highlightId={highlightId}
        onJoin={(id) => void trip.setGoing(id, true)}
        headerAction={
          <Button onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" className="size-4" />
            Add plan
          </Button>
        }
        renderBlockTitle={(item) => (
          <Link to={`/trips/${trip.tripId}/items/${item.id}`} className="hover:underline focus-visible:outline-2 focus-visible:outline-accent">
            {item.title}
          </Link>
        )}
      />

      <Sheet open={adding} onOpenChange={setAdding} title="Add a plan">
        <ItemForm
          tz={clock.timeZone}
          onCancel={() => setAdding(false)}
          onSubmit={async (values) => {
            await trip.addItem(values); // saved on this device first; sent as soon as there is a connection
            setAdding(false);
          }}
        />
      </Sheet>
    </div>
  );
}
