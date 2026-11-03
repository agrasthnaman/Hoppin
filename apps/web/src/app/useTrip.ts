import type { DocumentSource, TripSnapshot, TripSource } from "@hoppin/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { OfflineDb } from "../offline/db";
import { cacheDocuments, getLocalTrip, syncTrip, type CacheResult } from "../offline/sync";

export interface TripDeps {
  db: OfflineDb;
  tripSource: TripSource;
  documentSource: DocumentSource;
}

export type TripPhase = "loading" | "ready" | "removed" | "unavailable";

export interface TripState {
  phase: TripPhase;
  snapshot: TripSnapshot | null;
  /** When this device last fetched the trip (ms), or null. */
  syncedAt: number | null;
  syncing: boolean;
  /** The last refresh failed (the copy on the device, if any, is still shown). */
  syncFailed: boolean;
  /** Fetch the trip again and download its documents. */
  refresh: () => Promise<void>;
  /** Download every document this person may keep offline. */
  cacheAll: () => Promise<CacheResult>;
}

/**
 * One trip for one person. Always shows the copy on this device first; when there is a connection it refreshes
 * from the server (on open, when the connection returns, and on request) and downloads documents.
 */
export function useTrip(deps: TripDeps, tripId: string, viewerId: string): TripState {
  const [local, setLocal] = useState<{ snapshot: TripSnapshot; syncedAt: number } | null | undefined>(undefined);
  const [syncing, setSyncing] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);
  const [removed, setRemoved] = useState(false);
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const inflight = useRef<Promise<void> | null>(null);

  const offline = useCallback(
    () => ({ db: depsRef.current.db, source: depsRef.current.tripSource, documents: depsRef.current.documentSource, viewerId }),
    [viewerId],
  );

  const refresh = useCallback(() => {
    if (inflight.current) return inflight.current;
    setSyncing(true);
    setSyncFailed(false);
    const run = (async () => {
      try {
        const result = await syncTrip(offline(), tripId);
        if (result.status === "removed") setRemoved(true);
        else {
          setRemoved(false);
          await cacheDocuments(offline(), tripId);
        }
      } catch {
        setSyncFailed(true);
      } finally {
        inflight.current = null;
        setSyncing(false);
      }
    })();
    inflight.current = run;
    return run;
  }, [offline, tripId]);

  useEffect(() => {
    let alive = true;
    const read = () => getLocalTrip(depsRef.current.db, tripId).then((l) => alive && setLocal(l));
    const onSynced = (e: Event) => (e as CustomEvent<{ tripId: string }>).detail?.tripId === tripId && void read();
    const onOnline = () => void refresh();
    void read();
    if (navigator.onLine) void refresh();
    window.addEventListener("hoppin:synced", onSynced);
    window.addEventListener("online", onOnline);
    return () => {
      alive = false;
      window.removeEventListener("hoppin:synced", onSynced);
      window.removeEventListener("online", onOnline);
    };
  }, [tripId, refresh]);

  const phase: TripPhase = removed ? "removed" : local ? "ready" : local === undefined || syncing ? "loading" : "unavailable";
  return {
    phase,
    snapshot: local?.snapshot ?? null,
    syncedAt: local?.syncedAt ?? null,
    syncing,
    syncFailed,
    refresh,
    cacheAll: () => cacheDocuments(offline(), tripId),
  };
}
