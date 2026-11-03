import { formatSyncedAgo } from "@hoppin/core";
import { useState } from "react";
import { useServices } from "../app/services";
import { tripGate, useTripData } from "../app/trip-data";
import { useSignOut } from "../app/useSignOut";
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
      <div>
        <Button variant="ghost" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
