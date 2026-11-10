import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useServices } from "../app/services";
import { TripDataProvider } from "../app/trip-data";
import { useTripRoute } from "../app/useTripRoute";
import { waitingForOrganizer } from "../app/people";
import { AppShell } from "../components/AppShell";
import { NoticeList } from "../components/NoticeList";
import { UpdatesPanel } from "../components/UpdatesPanel";
import { useNow } from "../hooks/useNow";
import { useOnline } from "../hooks/useOnline";

function updatesRequested(state: unknown): boolean {
  return typeof state === "object" && state !== null && "updates" in state && state.updates === true;
}

/** Loads and syncs one trip, shares it with the screens below, and frames them with navigation and sync status. */
export function TripShell() {
  const trip = useTripRoute();
  const { actions } = useServices();
  const online = useOnline();
  const now = useNow();
  const location = useLocation();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const pageWhenOpened = useRef<string | null>(null);
  useEffect(() => {
    if (!updatesRequested(location.state)) return;
    setUpdatesOpen(true);
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location, navigate]);
  useEffect(() => {
    if (!updatesOpen) {
      pageWhenOpened.current = null;
      return;
    }
    if (pageWhenOpened.current === null) {
      pageWhenOpened.current = location.pathname;
      return;
    }
    if (pageWhenOpened.current !== location.pathname) setUpdatesOpen(false);
  }, [updatesOpen, location.pathname]);
  useEffect(() => {
    if (!online) return;
    let current = true;
    actions.unreadUpdates(trip.tripId).then(
      (n) => current && setUnread(n),
      () => {},
    );
    return () => {
      current = false;
    };
  }, [actions, trip.tripId, online, location.pathname, updatesOpen]);
  return (
    <TripDataProvider value={trip}>
      <AppShell
        basePath={`/trips/${trip.tripId}`}
        tripName={trip.snapshot?.trip.name ?? "Your trip"}
        status={{ online, lastSyncedAt: trip.syncedAt, now, pending: trip.pendingCount }}
        memberWaiting={waitingForOrganizer(trip.snapshot?.members ?? [], trip.viewerId)}
        unreadUpdates={unread}
        updatesOpen={updatesOpen}
        onOpenUpdates={() => setUpdatesOpen(true)}
        above={<NoticeList notices={trip.notices} onDismiss={(id) => void trip.dismissNotice(id)} />}
      />
      <UpdatesPanel open={updatesOpen} onOpenChange={setUpdatesOpen} />
    </TripDataProvider>
  );
}
