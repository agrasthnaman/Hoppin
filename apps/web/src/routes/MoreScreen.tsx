import { inputClass } from "../lib/forms";
import { formatSyncedAgo } from "@hoppin/core";
import { UserRound, Users } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useServices } from "../app/services";
import { tripGate, useTripData } from "../app/trip-data";
import { useSignOut } from "../app/useSignOut";
import { AppearanceCard } from "../components/AppearanceCard";
import { DraftList } from "../components/DraftList";
import { HomeCurrencyCard } from "../components/HomeCurrencyCard";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Sheet } from "../components/ui/Sheet";
import { useOnline } from "../hooks/useOnline";
import { wipeTrip } from "../offline/sync";

/** Offline controls and sign out. */
export function MoreScreen() {
  const trip = useTripData();
  const { clock, actions, db } = useServices();
  const navigate = useNavigate();
  const online = useOnline();
  const [leaving, setLeaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [busy2, setBusy2] = useState(false);
  const [tripError, setTripError] = useState<string | null>(null);
  const signOut = useSignOut();
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function downloadAll() {
    setBusy(true);
    setResult(null);
    try {
      const r = await trip.cacheAll();
      const docs = (n: number) => `${n} document${n === 1 ? "" : "s"}`;
      setResult(
        r.failed.length > 0
          ? `Couldn't save ${docs(r.failed.length)}. Try again.`
          : r.cached > 0
            ? `Saved ${docs(r.cached)} on this device.`
            : "Everything is already on this device.",
      );
    } catch {
      setResult("Couldn't save documents. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const gate = tripGate(trip);
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-2xl font-extrabold">More</h2>
      <Card className="flex flex-col p-0">
        <Link to={`/trips/${trip.tripId}/members`} className="flex items-center gap-3 rounded-card p-4 font-semibold focus-visible:outline-2 focus-visible:outline-accent">
          <Users aria-hidden="true" className="size-5 text-muted" />
          Members
        </Link>
        <Link to="/account" className="flex items-center gap-3 rounded-card p-4 font-semibold focus-visible:outline-2 focus-visible:outline-accent">
          <UserRound aria-hidden="true" className="size-5 text-muted" />
          Account
        </Link>
      </Card>
      {gate ?? (
        <Card className="flex flex-col gap-3">
          <h3 className="font-semibold">Offline</h3>
          <p className="text-sm text-muted">
            {formatSyncedAgo(trip.syncedAt, clock.now())}. Your plans and documents are kept on this device so you can open them without a connection.
          </p>
          {trip.syncFailed && <p className="text-sm text-danger-fg">The last refresh didn't work. What you see is the saved copy.</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={trip.syncing} onClick={() => void trip.refresh()}>
              Refresh now
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => void downloadAll()}>
              Download everything for offline use
            </Button>
          </div>
          {result && <p role="status" className="text-sm">{result}</p>}
        </Card>
      )}
      <AppearanceCard />
      <HomeCurrencyCard />
      {!gate && (
        <Card className="flex flex-col gap-3">
          <h3 className="font-semibold">Unsent changes</h3>
          <p className="text-sm text-muted">Changes that couldn't be applied, for example because someone else changed the same thing. Nothing here is lost until you discard it.</p>
          <DraftList drafts={trip.drafts} onApply={trip.applyDraft} onDiscard={(id) => void trip.discardDraft(id)} />
        </Card>
      )}
      {!gate && trip.snapshot && (() => {
        const members = trip.snapshot.members;
        const me = members.find((x) => x.userId === trip.viewerId);
        const isOrganizer = me?.role === "organizer";
        const soleOrganizer = isOrganizer && !members.some((x) => x.status === "approved" && x.role === "organizer" && x.userId !== trip.viewerId);
        const tripName = trip.snapshot.trip.name;

        async function finish(action: () => Promise<void>, failure: string) {
          setBusy2(true);
          setTripError(null);
          try {
            await action();
            await wipeTrip(db, trip.tripId);
            navigate("/", { replace: true });
          } catch {
            setTripError(failure);
            setBusy2(false);
          }
        }

        return (
          <>
            <Card className="flex flex-col gap-3">
              <h3 className="font-semibold">This trip</h3>
              {!online && <p className="text-sm text-muted">Connect to the internet to leave or delete a trip.</p>}
              {soleOrganizer && (
                <p className="text-sm text-muted">You're the only organizer. Make someone else an organizer or delete the trip first.</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" disabled={!online || soleOrganizer} onClick={() => { setTripError(null); setLeaving(true); }}>
                  Leave this trip
                </Button>
                {isOrganizer && (
                  <Button variant="secondary" disabled={!online} onClick={() => { setTripError(null); setTypedName(""); setDeleting(true); }}>
                    Delete this trip
                  </Button>
                )}
              </div>
            </Card>

            <Sheet
              open={leaving}
              onOpenChange={(open) => !busy2 && setLeaving(open)}
              title="Leave this trip?"
              description="Your private plans and personal documents in this trip are deleted. Plans and bookings you added for the group stay. You can join again with a new invite link."
            >
              <div className="flex flex-col gap-3">
                {tripError && <p role="alert" className="text-sm text-danger-fg">{tripError}</p>}
                <div className="flex gap-2">
                  <Button disabled={busy2} onClick={() => void finish(() => actions.leaveTrip(trip.tripId), "Couldn't leave the trip. Check your connection and try again.")}>
                    Leave trip
                  </Button>
                  <Button variant="ghost" disabled={busy2} onClick={() => setLeaving(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </Sheet>

            <Sheet
              open={deleting}
              onOpenChange={(open) => !busy2 && setDeleting(open)}
              title={`Delete ${tripName} for everyone?`}
              description="This deletes every plan, booking and document in the trip for all members, and removes it from their phones. This can't be undone."
            >
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <label htmlFor="confirm-trip-name" className="text-sm font-medium">
                    Type the trip name to confirm
                  </label>
                  <input
                    id="confirm-trip-name"
                    autoComplete="off"
                    value={typedName}
                    onChange={(e) => setTypedName(e.target.value)}
                    className={inputClass}
                  />
                </div>
                {tripError && <p role="alert" className="text-sm text-danger-fg">{tripError}</p>}
                <div className="flex gap-2">
                  <Button disabled={busy2 || typedName.trim() !== tripName} onClick={() => void finish(() => actions.deleteTrip(trip.tripId), "Couldn't delete the trip. Check your connection and try again.")}>
                    Delete trip
                  </Button>
                  <Button variant="ghost" disabled={busy2} onClick={() => setDeleting(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </Sheet>
          </>
        );
      })()}
      <div>
        <Button variant="ghost" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
