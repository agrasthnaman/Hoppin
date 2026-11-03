import { CalendarDays, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useServices } from "../app/services";
import { useSignOut } from "../app/useSignOut";
import { CreateTripForm } from "../components/CreateTripForm";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Sheet } from "../components/ui/Sheet";
import { useOnline } from "../hooks/useOnline";
import { cn } from "../lib/cn";
import { formatDateRange } from "../lib/dates";

// Trip cards take turns with the palette's big colour block, the soft pop tint and a plain card.
const TRIP_LOOKS = [
  { card: "bg-hero text-hero-fg", sub: "text-hero-muted" },
  { card: "bg-accent-soft text-accent-soft-fg", sub: "text-accent-soft-fg" },
  { card: "border border-line bg-surface text-fg shadow-card", sub: "text-muted" },
];

type Trips = { id: string; name: string; startDate?: string | null; endDate?: string | null }[];

/** The person's trips, and creating a new one (the creator becomes its organizer). */
export function TripsHome() {
  const { actions } = useServices();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const online = useOnline();
  const [trips, setTrips] = useState<Trips | "error" | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let alive = true;
    actions.listTrips().then(
      (list) => alive && setTrips(list),
      () => alive && setTrips("error"),
    );
    return () => {
      alive = false;
    };
  }, [actions]);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-4xl font-extrabold">Your trips</h1>
        <Button disabled={!online} onClick={() => setCreating(true)}>
          <Plus aria-hidden="true" className="size-4" />
          New trip
        </Button>
      </div>
      {!online && <p className="text-sm text-muted">Connect to the internet to create a trip.</p>}
      {trips === null && <p role="status">Loading…</p>}
      {trips === "error" && <p>Couldn't load your trips. Check your connection and try again.</p>}
      {Array.isArray(trips) && trips.length === 0 && <p className="text-muted">No trips yet. Create one, or ask the organizer to send you an invite link.</p>}
      {Array.isArray(trips) && trips.length > 0 && (
        <ul className="flex flex-col gap-3">
          {trips.map((trip, i) => {
            const look = TRIP_LOOKS[i % TRIP_LOOKS.length]!;
            return (
              <li key={trip.id}>
                <Link
                  to={`/trips/${trip.id}`}
                  className={cn("flex flex-col gap-2 rounded-card p-5 transition-transform active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent", look.card)}
                >
                  <span className="font-display text-3xl font-extrabold leading-none">{trip.name}</span>
                  <span className={cn("flex items-center gap-1.5 text-sm font-medium", look.sub)}>
                    <CalendarDays aria-hidden="true" className="size-4" />
                    {formatDateRange(trip.startDate, trip.endDate)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <div>
        <Button variant="ghost" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>

      <Sheet open={creating} onOpenChange={setCreating} title="New trip">
        <CreateTripForm
          onCancel={() => setCreating(false)}
          onSubmit={async (trip) => {
            const id = await actions.createTrip(trip);
            setCreating(false);
            navigate(`/trips/${id}/days`);
          }}
        />
      </Sheet>
    </main>
  );
}
