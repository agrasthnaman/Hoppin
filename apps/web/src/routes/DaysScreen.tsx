import { addDays, buildDay, canEdit, dayStops, defaultDay, localDate, planZone, type Item } from "@hoppin/core";
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
import { DayGlance } from "../components/map/DayGlance";
import { DayMap } from "../components/map/DayMap";
import { NowNext } from "../components/NowNext";
import { ItemForm } from "../components/ItemForm";
import { Button } from "../components/ui/Button";
import { SpiderCursor as SilkSpiderCursor } from "../components/ui/SpiderCursor";
import { Sheet } from "../components/ui/Sheet";
import { swipeDay, swipeDirection } from "../lib/gestures";
import { useOnline } from "../hooks/useOnline";
import { uploadEach } from "../lib/upload-many";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const VIEW_KEY = "hoppin.plan-view";

function savedView(): "list" | "map" {
  try {
    return localStorage.getItem(VIEW_KEY) === "map" ? "map" : "list";
  } catch {
    return "list";
  }
}

function storeView(mode: "list" | "map") {
  try {
    localStorage.setItem(VIEW_KEY, mode);
  } catch {
    // a private window can refuse storage; the choice still applies for this visit
  }
}

/** How many days after the trip starts `date` is. 0 when the trip has no start. */
function dayIndex(start: string | null, date: string): number {
  if (!start || date < start) return 0;
  let index = 0;
  for (let day = start; day < date && index < 400; day = addDays(day, 1)) index += 1;
  return index;
}

/** One day of the trip: a strip of day pills, the plans (the one happening now or next is spotlighted), RSVPs, adding a plan. */
export function DaysScreen() {
  const trip = useTripData();
  const { actions, clock } = useServices();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [view, setView] = useState<"list" | "map">(savedView);
  const online = useOnline();

  const gate = tripGate(trip);
  if (gate || !trip.snapshot) return gate;
  const { snapshot } = trip;
  const member = snapshot.members.find((entry) => entry.userId === trip.viewerId);

  const requested = params.get("date");
  const date = requested && DATE.test(requested) ? requested : defaultDay(snapshot.trip, clock.now(), clock.timeZone);
  const layout = buildDay(snapshot.items, trip.viewerId, date, clock.timeZone);
  const going = goingFrom(snapshot.rsvps);
  const joined = new Set(Object.entries(going).filter(([, ids]) => ids.includes(trip.viewerId)).map(([id]) => id));
  const stops = dayStops(snapshot.items, trip.viewerId, joined, date, clock.timeZone);
  const placed = stops.stops.length + stops.stays.length > 0;
  const hasDates = Boolean(snapshot.trip.startDate && snapshot.trip.endDate);
  const now = clock.now();
  const isToday = date === localDate(now, clock.timeZone);
  // Today opens on "what is on now and next" (NowNext), so the plan list itself does not spotlight a second card.
  const highlightId = isToday ? null : (layout.blocks.find((b) => b.kind !== "stay") ?? layout.blocks[0])?.id ?? null;

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

      {isToday && <NowNext items={snapshot.items} viewerId={trip.viewerId} now={now} tripId={trip.tripId} />}

      <DayWeather destination={snapshot.trip.destination} date={date} />

      {placed && view === "list" && stops.stops.length > 0 && (
        <DayGlance day={stops} dayIndex={dayIndex(snapshot.trip.startDate, date)} tripId={trip.tripId} online={online} />
      )}

      {placed && (
        <div className="flex items-center justify-between gap-2">
          <div role="group" aria-label="Plan view" className="flex gap-2">
            {(["list", "map"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={view === mode}
                onClick={() => {
                  setView(mode);
                  storeView(mode);
                }}
                className={`min-h-11 rounded-full px-4 text-sm font-semibold capitalize focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${view === mode ? "bg-accent text-accent-fg" : "bg-raised"}`}
              >
                {mode === "list" ? "List" : "Map"}
              </button>
            ))}
          </div>
          {view === "map" && (
            <Button onClick={() => setAdding(true)}>
              <Plus aria-hidden="true" className="size-4" />
              Add plan
            </Button>
          )}
        </div>
      )}

      {placed && view === "map" ? (
        <DayMap day={stops} dayIndex={dayIndex(snapshot.trip.startDate, date)} tripId={trip.tripId} online={online} items={snapshot.items} />
      ) : (
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
        tz={planZone(snapshot.items, date, clock.timeZone)}
        layout={layout}
        people={peopleFrom(snapshot.members)}
        viewerId={trip.viewerId}
        goingByItem={goingFrom(snapshot.rsvps)}
        highlightId={highlightId}
        onJoin={(id) => trip.setGoing(id, true)}
        onLeave={(id) => trip.setGoing(id, false)}
        canEditItem={(item) => (member ? canEdit(item, member) : false)}
        onEdit={setEditing}
        onRemove={(item) => void trip.removeItem(item)}
        polls={snapshot.polls ?? []}
        votes={snapshot.votes ?? []}
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
      )}

      <Sheet open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} title="Edit plan">
        {editing && (
          <ItemForm
            initial={editing}
            tz={editing.tz}
            near={snapshot.trip.destination}
            onCancel={() => setEditing(null)}
            onSubmit={async (values) => {
              await trip.editItem(editing, values);
              setEditing(null);
            }}
          />
        )}
      </Sheet>

      <Sheet open={adding} onOpenChange={setAdding} title="Add a plan">
        <ItemForm
          tz={planZone(snapshot.items, date, clock.timeZone)}
          near={snapshot.trip.destination}
          defaultDate={date}
          onCancel={() => setAdding(false)}
          onSubmit={async (values, files) => {
            const id = await trip.addItem(values); // saved on this device first; sent as soon as there is a connection
            if (files?.length) {
              await uploadEach(files, (file) => actions.uploadDocument(file, { tripId: trip.tripId, ownerId: trip.viewerId, itemId: id, scope: "shared", kind: "document" }));
              await trip.refresh();
            }
            setAdding(false);
          }}
        />
      </Sheet>
    </div>
  );
}
