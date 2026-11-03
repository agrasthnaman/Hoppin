import { useParams } from "react-router";
import { TripDataProvider } from "../app/trip-data";
import { useServices } from "../app/services";
import { useTrip } from "../app/useTrip";
import { useUser } from "../app/user";
import { AppShell } from "../components/AppShell";
import { useNow } from "../hooks/useNow";
import { useOnline } from "../hooks/useOnline";

/** Loads and syncs one trip, shares it with the screens below, and frames them with navigation and sync status. */
export function TripShell() {
  const { tripId = "" } = useParams();
  const { userId } = useUser();
  const services = useServices();
  const trip = useTrip(services, tripId, userId);
  const online = useOnline();
  const now = useNow();
  return (
    <TripDataProvider value={{ ...trip, tripId, viewerId: userId }}>
      <AppShell
        basePath={`/trips/${tripId}`}
        tripName={trip.snapshot?.trip.name ?? "Your trip"}
        status={{ online, lastSyncedAt: trip.syncedAt, now }}
      />
    </TripDataProvider>
  );
}
