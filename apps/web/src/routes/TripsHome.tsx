import { m } from "motion/react";
import { CalendarDays, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useServices } from "../app/services";
import { useSignOut } from "../app/useSignOut";
import { CreateTripForm } from "../components/CreateTripForm";
import { bookingItemValues } from "../lib/booking-draft";
import { JoinTripForm } from "../components/JoinTripForm";
import { Button } from "../components/ui/Button";
import { SpiderCursor as SilkSpiderCursor } from "../components/ui/SpiderCursor";
import { Sheet } from "../components/ui/Sheet";
import { useOnline } from "../hooks/useOnline";
import { springSoft } from "../lib/motion";
import { formatDateRange } from "../lib/dates";
import { FirstDay } from "./FirstDay";

type Trips = { id: string; name: string; startDate?: string | null; endDate?: string | null }[];

/** The person's trips, and creating a new one (the creator becomes its organizer). */
export function TripsHome() {
  const services = useServices();
  const { actions } = services;
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
          const id = await actions.createTrip({ name: trip.name, startDate: trip.startDate, endDate: trip.endDate });
          const { data } = await services.sessionClient.auth.getSession();
          const ownerId = data.session?.user.id;
          if (ownerId) {
            for (const booking of trip.bookings) {
              const values = bookingItemValues(booking, trip.startDate, services.clock.timeZone);
              if (!values) continue;
              try {
                const itemId = crypto.randomUUID();
                await actions.createItem(id, ownerId, values, itemId);
                await actions.uploadDocument(booking.file, { tripId: id, ownerId, itemId, scope: "shared", kind: "document" });
              } catch {
                // The trip is saved. The organizer can fix a booking the file did not read.
              }
            }
          }
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
    <main className="trips-stage">
      <style>{TRIPS_CSS}</style>
      <header className="trips-bar">
        <span data-silk-anchor>hoppin</span>
        <div className="trips-bar-actions">
          <Link to="/account" aria-label="Account">
            Account
          </Link>
          <Button disabled={!online} onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" className="size-4" />
            New trip
          </Button>
        </div>
      </header>
      <h1 className="trips-title" data-silk-anchor>
        Your trips
      </h1>
      <p className="trips-lede">Pick one up, start the next, or join with an invite.</p>
      <article className="trips-join on-cream" data-silk-anchor>
        <h2>Join a trip</h2>
        <p>Paste the invite link an organizer sent you.</p>
        <JoinTripForm onJoin={(token) => navigate(`/join/${token}`)} />
      </article>
      {!online && <p className="trips-note">Connect to the internet to create a trip.</p>}
      {trips === null && <p role="status" className="trips-note">Loading…</p>}
      {trips === "error" && <p className="trips-note">Couldn't load your trips. Check your connection and try again.</p>}
      {Array.isArray(trips) && trips.length > 0 && (
        <m.ul className="trips-list" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}>
          {trips.map((trip, i) => (
            <m.li key={trip.id} variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: springSoft } }} style={{ rotate: i % 2 === 0 ? "-0.6deg" : "0.8deg" }}>
              <Link to={`/trips/${trip.id}`} className="trips-card" data-silk-anchor>
                <span className="trips-name">{trip.name}</span>
                <span className="trips-when">
                  <CalendarDays aria-hidden="true" className="size-4" />
                  {formatDateRange(trip.startDate, trip.endDate)}
                </span>
              </Link>
            </m.li>
          ))}
        </m.ul>
      )}
      <button type="button" className="trips-out" onClick={() => void signOut()}>
        Sign out
      </button>
      <SilkSpiderCursor bounceColor="#0d22ee" shadowColor="#000a3a" silkColor="#f6f3ec" seedWebs={8} />
      {sheet}
    </main>
  );
}

const TRIPS_CSS = `
.trips-stage { position: relative; min-height: 100svh; padding: 28px clamp(16px, 4vw, 56px) 72px; background: #0d22ee; color: #f6f3ec; overflow-x: clip;
  font-family: "Helvetica Neue", "Neue Haas Grotesk Text", Inter, Arial, system-ui, sans-serif; }
.trips-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; font-size: 22px; font-weight: 500; letter-spacing: -0.03em; }
.trips-bar-actions { display: flex; align-items: center; gap: 16px; }
.trips-bar a { color: #f6f3ec; font-size: 15px; font-weight: 600; text-decoration: none; }
.trips-title { margin: 36px 0 0; font-size: clamp(52px, 8vw, 88px); line-height: 0.88; font-weight: 500; letter-spacing: -0.06em; }
.trips-lede, .trips-note { margin: 14px 0 0; max-width: 36rem; font-size: 18px; font-weight: 300; line-height: 1.45; color: rgba(246,243,236,0.9); }
.trips-join { max-width: 420px; margin-top: 22px; padding: 22px; border-radius: 20px; background: #f6f3ec; color: #101428; box-shadow: 0 24px 50px -18px rgba(0,4,60,0.55); }
.trips-join h2 { margin: 0; font-size: 28px; font-weight: 500; letter-spacing: -0.04em; }
.trips-join p { margin: 8px 0 14px; font-size: 15px; line-height: 1.4; }
.trips-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; max-width: 880px; margin: 28px 0 0; padding: 0; list-style: none; }
.trips-card { display: flex; flex-direction: column; gap: 10px; min-height: 150px; padding: 22px; border-radius: 20px; background: #f6f3ec; color: #101428; text-decoration: none;
  box-shadow: 0 24px 50px -18px rgba(0,4,60,0.55); }
.trips-card:hover { transform: translateY(-2px); }
.trips-name { font-size: clamp(28px, 3vw, 40px); font-weight: 500; letter-spacing: -0.045em; line-height: 0.95; }
.trips-when { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 500; color: #3c4a78; }
.trips-out { margin-top: 32px; padding: 0; border: 0; background: transparent; color: #f6f3ec; font: inherit; font-size: 15px; font-weight: 600; cursor: pointer; }
.trips-stage a:focus-visible, .trips-stage button:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
@media (max-width: 760px) {
  .trips-list { grid-template-columns: 1fr; }
}
`;
