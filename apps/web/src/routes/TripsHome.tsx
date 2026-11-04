import { m } from "motion/react";
import { CalendarDays, Plus, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useServices } from "../app/services";
import { useSignOut } from "../app/useSignOut";
import { CreateTripForm } from "../components/CreateTripForm";
import { Button } from "../components/ui/Button";
import { Sheet } from "../components/ui/Sheet";
import { useOnline } from "../hooks/useOnline";
import { cn } from "../lib/cn";
import { springSoft } from "../lib/motion";
import { formatDateRange } from "../lib/dates";
import { FirstDay } from "./FirstDay";

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

  const sheet = (
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
  );

  if (Array.isArray(trips) && trips.length === 0) {
    return (
      <>
        <FirstDay online={online} onStart={() => setCreating(true)} onJoin={(token) => navigate(`/join/${token}`)} />
        {sheet}
      </>
    );
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-4xl font-extrabold">Your trips</h1>
        <div className="flex items-center gap-2">
          <Link
            to="/account"
            aria-label="Account"
            className="inline-flex size-11 items-center justify-center rounded-full bg-raised hover:brightness-95 focus-visible:outline-2 focus-visible:outline-accent"
          >
            <UserRound aria-hidden="true" className="size-5" />
          </Link>
          <Button disabled={!online} onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" className="size-4" />
            New trip
          </Button>
        </div>
      </div>
      {!online && <p className="text-sm text-muted">Connect to the internet to create a trip.</p>}
      {trips === null && <p role="status">Loading…</p>}
      {trips === "error" && <p>Couldn't load your trips. Check your connection and try again.</p>}
      {Array.isArray(trips) && trips.length > 0 && (
        <m.ul className="flex flex-col gap-3" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}>
          {trips.map((trip, i) => {
            const look = TRIP_LOOKS[i % TRIP_LOOKS.length]!;
            return (
              <m.li key={trip.id} variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: springSoft } }}>
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
              </m.li>
            );
          })}
        </m.ul>
      )}
      <div>
        <Button variant="ghost" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>

      {sheet}
    </main>
  );
}
