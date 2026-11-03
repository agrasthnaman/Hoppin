import { formatSyncedAgo } from "@hoppin/core";
import { Users } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { useServices } from "../app/services";
import { tripGate, useTripData } from "../app/trip-data";
import { useSignOut } from "../app/useSignOut";
import { DraftList } from "../components/DraftList";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";

/** Offline controls and sign out. */
export function MoreScreen() {
  const trip = useTripData();
  const { clock } = useServices();
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
      <h2 className="text-xl font-bold">More</h2>
      <Card className="p-0">
        <Link to={`/trips/${trip.tripId}/members`} className="flex items-center gap-3 rounded-card p-4 font-semibold focus-visible:outline-2 focus-visible:outline-accent">
          <Users aria-hidden="true" className="size-5 text-muted" />
          Members
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
      {!gate && (
        <Card className="flex flex-col gap-3">
          <h3 className="font-semibold">Unsent changes</h3>
          <p className="text-sm text-muted">Changes that couldn't be applied, for example because someone else changed the same thing. Nothing here is lost until you discard it.</p>
          <DraftList drafts={trip.drafts} onApply={trip.applyDraft} onDiscard={(id) => void trip.discardDraft(id)} />
        </Card>
      )}
      <div>
        <Button variant="ghost" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
