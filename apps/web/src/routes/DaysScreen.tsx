import { addDays, buildDay, defaultDay, localDate, nextBlock } from "@hoppin/core";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import { m } from "motion/react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { goingFrom, peopleFrom } from "../app/people";
import { useServices } from "../app/services";
import { tripGate, useTripData } from "../app/trip-data";
import { DayStrip } from "../components/DayStrip";
import { DayWeather } from "../components/DayWeather";
import { DayView } from "../components/DayView";
import { ItemForm } from "../components/ItemForm";
import { Button } from "../components/ui/Button";
import { SpiderCursor as SilkSpiderCursor } from "../components/ui/SpiderCursor";
import { Sheet } from "../components/ui/Sheet";
import { swipeDay, swipeDirection } from "../lib/gestures";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** One day of the trip: a strip of day pills, the plans (the one happening now or next is spotlighted), RSVPs, adding a plan. */
export function DaysScreen() {
  const trip = useTripData();
  const { actions, clock } = useServices();
  const [params] = useSearchParams();
  const navigate = useNavigate();
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
  const quiet = snapshot.items.length === 0;
  return (
    <div className="relative flex flex-col gap-4">
      {quiet && (
        <section className="rounded-card bg-hero p-5 text-hero-fg" data-silk-anchor>
          <p className="text-sm font-semibold text-hero-muted">Welcome</p>
          <h2 className="page-title text-4xl">This day is waiting</h2>
          <p className="mt-2 text-hero-muted">Add the first plan. The group sees it as soon as you do.</p>
          <SilkSpiderCursor bounceColor="#0d22ee" shadowColor="#000a3a" silkColor="#f6f3ec" seedWebs={6} />
        </section>
      )}
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

      <DayWeather destination={snapshot.trip.destination} date={date} />

      <m.div
        className="min-h-[60dvh]" // the whole area is swipeable, even on a quiet day
        drag="x"
        dragDirectionLock
        dragSnapToOrigin
        dragMomentum={false}
        dragElastic={0.15}
        onDragEnd={(_, info) => {
          // swipe left for the next day, right for the previous one (the day strip works too)
          const direction = swipeDirection(info.offset.x, info.velocity.x, info.offset.y);
          const target = direction && swipeDay(date, direction, snapshot.trip.startDate, snapshot.trip.endDate);
          if (target) navigate({ search: `?date=${target}` });
        }}
      >
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
      </m.div>

      <Sheet open={adding} onOpenChange={setAdding} title="Add a plan">
        <ItemForm
          tz={clock.timeZone}
          onCancel={() => setAdding(false)}
          onSubmit={async (values, file) => {
            const id = await trip.addItem(values); // saved on this device first; sent as soon as there is a connection
            if (file) {
              await actions.uploadDocument(file, { tripId: trip.tripId, ownerId: trip.viewerId, itemId: id, scope: "shared", kind: "document" });
              await trip.refresh();
            }
            setAdding(false);
          }}
        />
      </Sheet>
    </div>
  );
}
