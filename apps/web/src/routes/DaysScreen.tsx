import { addDays, buildDay, defaultDay } from "@hoppin/core";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { goingFrom, peopleFrom } from "../app/people";
import { useServices } from "../app/services";
import { tripGate, useTripData } from "../app/trip-data";
import { DayView } from "../components/DayView";
import { ItemForm } from "../components/ItemForm";
import { Button } from "../components/ui/Button";
import { Sheet } from "../components/ui/Sheet";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** One day of the trip with previous and next day, RSVPs, and adding a plan. */
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

  const navLink = "inline-flex size-11 items-center justify-center rounded-full bg-raised hover:bg-line focus-visible:outline-2 focus-visible:outline-accent";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Link to={{ search: `?date=${addDays(date, -1)}` }} aria-label="Previous day" className={navLink}>
          <ChevronLeft aria-hidden="true" className="size-5" />
        </Link>
        <Button onClick={() => setAdding(true)}>
          <Plus aria-hidden="true" className="size-4" />
          Add plan
        </Button>
        <Link to={{ search: `?date=${addDays(date, 1)}` }} aria-label="Next day" className={navLink}>
          <ChevronRight aria-hidden="true" className="size-5" />
        </Link>
      </div>

      <DayView
        date={date}
        tz={clock.timeZone}
        layout={layout}
        people={peopleFrom(snapshot.members)}
        viewerId={trip.viewerId}
        goingByItem={goingFrom(snapshot.rsvps)}
        onJoin={(id) => void trip.setGoing(id, true)}
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
