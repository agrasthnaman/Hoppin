import { useEffect, useState } from "react";
import type { OfflineDb } from "../offline/db";
import { getLocalTrip } from "../offline/sync";

/** When this device last synced a trip (from the local copy), kept up to date as syncs happen. */
export function useLocalSyncedAt(db: OfflineDb, tripId: string): { loaded: boolean; syncedAt: number | null } {
  const [state, setState] = useState<{ loaded: boolean; syncedAt: number | null }>({ loaded: false, syncedAt: null });

  useEffect(() => {
    let cancelled = false;
    const read = () =>
      getLocalTrip(db, tripId).then((local) => {
        if (!cancelled) setState({ loaded: true, syncedAt: local?.syncedAt ?? null });
      });
    const onSynced = (event: Event) => {
      if ((event as CustomEvent<{ tripId: string }>).detail?.tripId === tripId) void read();
    };
    void read();
    window.addEventListener("hoppin:synced", onSynced);
    return () => {
      cancelled = true;
      window.removeEventListener("hoppin:synced", onSynced);
    };
  }, [db, tripId]);

  return state;
}
