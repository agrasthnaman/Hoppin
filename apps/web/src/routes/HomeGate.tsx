import { currentTripId, localDate } from "@hoppin/core";
import { lazy, Suspense, useEffect, useState } from "react";
import { Link, Navigate } from "react-router";
import { useServices } from "../app/services";
import { useSession } from "../app/session";
import { UserContext } from "../app/user";
import { TripsHome } from "./TripsHome";

/** Shown if the landing page cannot be loaded (it is big, so it is not stored for offline use). */
function OfflineWelcome() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="font-display text-5xl font-extrabold">hoppin</h1>
      <p className="text-muted">You're offline. The full welcome page will load when you're back online. If you already have an account, you can still sign in to see your saved trips.</p>
      <div>
        <Link to="/sign-in" className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 font-semibold text-accent-fg">
          Sign in
        </Link>
      </div>
    </main>
  );
}

const LandingPage = lazy(() => import("./Landing").catch(() => ({ default: OfflineWelcome })));

/** The marketing page. Loaded on its own so the spider and its model stay out of the signed-in app. */
export function WelcomePage() {
  return (
    <Suspense fallback={<p role="status" className="p-4">Loading…</p>}>
      <LandingPage />
    </Suspense>
  );
}

/** Signed-in home: Today for the trip that is happening, otherwise the trip list. */
function SignedInHome() {
  const { actions, clock } = useServices();
  const [tripId, setTripId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    actions.listTrips().then(
      (trips) => {
        if (alive) setTripId(currentTripId(trips, localDate(clock.now(), clock.timeZone)));
      },
      () => alive && setTripId(null),
    );
    return () => {
      alive = false;
    };
  }, [actions, clock]);

  if (tripId === undefined) return <p role="status" className="p-4">Loading…</p>;
  if (tripId) return <Navigate to={`/trips/${tripId}/today`} replace />;
  return <TripsHome />;
}

/**
 * Signed-out visitors get the landing page. Signed-in people open Today when a trip
 * is underway, and their trip list otherwise.
 */
export function HomeGate() {
  const { sessionClient } = useServices();
  const session = useSession(sessionClient);
  if (session.status === "loading") return <p role="status" className="p-4">Loading…</p>;
  if (session.status === "signedOut") return <WelcomePage />;
  return (
    <UserContext.Provider value={{ userId: session.userId, email: session.email }}>
      <SignedInHome />
    </UserContext.Provider>
  );
}
