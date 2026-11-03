import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useServices } from "../app/services";
import { useSignOut } from "../app/useSignOut";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";

type Trips = { id: string; name: string }[];

/** The person's trips. (Creating a trip, covers and dates come with issue #9.) */
export function TripsHome() {
  const { actions } = useServices();
  const signOut = useSignOut();
  const [trips, setTrips] = useState<Trips | "error" | null>(null);

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
      <h1 className="text-2xl font-bold">Your trips</h1>
      {trips === null && <p role="status">Loading…</p>}
      {trips === "error" && <p>Couldn't load your trips. Check your connection and try again.</p>}
      {Array.isArray(trips) && trips.length === 0 && <p className="text-muted">No trips yet. Ask the organizer to send you an invite link.</p>}
      {Array.isArray(trips) && trips.length > 0 && (
        <ul className="flex flex-col gap-2">
          {trips.map((trip) => (
            <li key={trip.id}>
              <Card className="p-0">
                <Link to={`/trips/${trip.id}`} className="block rounded-card p-4 text-lg font-semibold focus-visible:outline-2 focus-visible:outline-accent">
                  {trip.name}
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <div>
        <Button variant="ghost" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </main>
  );
}
