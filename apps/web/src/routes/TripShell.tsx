import { useParams } from "react-router";
import { AppShell } from "../components/AppShell";
import { useNow } from "../hooks/useNow";
import { useLocalSyncedAt } from "../hooks/useLocalSyncedAt";
import { useOnline } from "../hooks/useOnline";
import { sharedOfflineDb } from "../offline/db";

/**
 * Connects the shell to the live connection state and to when this device last synced the trip.
 * The trip name is a placeholder until trips load from the data layer.
 */
export function TripShell() {
  const { tripId = "" } = useParams();
  const online = useOnline();
  const now = useNow();
  const { syncedAt } = useLocalSyncedAt(sharedOfflineDb(), tripId);
  return <AppShell basePath={`/trips/${tripId}`} tripName="Your trip" status={{ online, lastSyncedAt: syncedAt, now }} />;
}
