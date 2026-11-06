import { TripDataProvider } from "../app/trip-data";
import { useTripRoute } from "../app/useTripRoute";
import { waitingForOrganizer } from "../app/people";
import { AppShell } from "../components/AppShell";
import { NoticeList } from "../components/NoticeList";
import { useNow } from "../hooks/useNow";
import { useOnline } from "../hooks/useOnline";

/** Loads and syncs one trip, shares it with the screens below, and frames them with navigation and sync status. */
export function TripShell() {
  const trip = useTripRoute();
  const online = useOnline();
  const now = useNow();
  return (
    <TripDataProvider value={trip}>
      <AppShell
        basePath={`/trips/${trip.tripId}`}
        tripName={trip.snapshot?.trip.name ?? "Your trip"}
        status={{ online, lastSyncedAt: trip.syncedAt, now, pending: trip.pendingCount }}
        memberWaiting={waitingForOrganizer(trip.snapshot?.members ?? [], trip.viewerId)}
        above={<NoticeList notices={trip.notices} onDismiss={(id) => void trip.dismissNotice(id)} />}
      />
    </TripDataProvider>
  );
}
