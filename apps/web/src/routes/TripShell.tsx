import { useParams } from "react-router";
import { AppShell } from "../components/AppShell";
import { useNow } from "../hooks/useNow";
import { useOnline } from "../hooks/useOnline";

/**
 * Connects the shell to the live connection state. The trip name and last-synced time are placeholders
 * until the offline cache and data loading arrive (issues #13 and later).
 */
export function TripShell() {
  const { tripId = "" } = useParams();
  const online = useOnline();
  const now = useNow();
  return <AppShell basePath={`/trips/${tripId}`} tripName="Your trip" status={{ online, lastSyncedAt: null, now }} />;
}
