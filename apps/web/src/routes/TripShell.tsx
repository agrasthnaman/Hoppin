import { useParams } from "react-router";
import { TripDataProvider } from "../app/trip-data";
import { useServices } from "../app/services";
import { useTrip } from "../app/useTrip";
import { useUser } from "../app/user";
import { waitingForOrganizer } from "../app/people";
import { AppShell } from "../components/AppShell";
import { NoticeList } from "../components/NoticeList";
import { useNow } from "../hooks/useNow";
import { useOnline } from "../hooks/useOnline";

/** Loads and syncs one trip, shares it with the screens below, and frames them with navigation and sync status. */
export function TripShell() {
  const { tripId = "" } = useParams();
  const { userId } = useUser();
  const services = useServices();
  const trip = useTrip(
    {
      db: services.db,
      tripSource: services.tripSource,
      documentSource: services.documentSource,
      writer: services.actions,
      moneyWriter: services.actions,
      rates: services.rates,
    },
    tripId,
    userId,
  );
  const online = useOnline();
  const now = useNow();
  return (
    <TripDataProvider value={{ ...trip, tripId, viewerId: userId }}>
      <AppShell
        basePath={`/trips/${tripId}`}
        tripName={trip.snapshot?.trip.name ?? "Your trip"}
        status={{ online, lastSyncedAt: trip.syncedAt, now, pending: trip.pendingCount }}
        memberWaiting={waitingForOrganizer(trip.snapshot?.members ?? [], userId)}
        above={<NoticeList notices={trip.notices} onDismiss={(id) => void trip.dismissNotice(id)} />}
      />
    </TripDataProvider>
  );
}
