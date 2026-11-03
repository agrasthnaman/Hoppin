import type { TripSnapshot } from "@hoppin/core";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useLocalSyncedAt } from "../src/hooks/useLocalSyncedAt";
import { openOfflineDb } from "../src/offline/db";
import { syncTrip, wipeTrip } from "../src/offline/sync";

const snapshot = (id: string): TripSnapshot => ({
  trip: { id, name: "Goa", startDate: null, endDate: null },
  members: [],
  items: [],
  rsvps: [],
  documents: [],
});
const depsFor = (db: ReturnType<typeof openOfflineDb>, now: number) => ({
  db,
  source: { fetchSnapshot: async (id: string) => ({ status: "ok" as const, snapshot: snapshot(id) }) },
  documents: { download: async () => ({ data: new ArrayBuffer(0), contentType: "x" }) },
  viewerId: "me",
  now: () => now,
});

describe("useLocalSyncedAt", () => {
  it("is null before the first sync, then follows each sync and wipe", async () => {
    const db = openOfflineDb("hook-1");
    const { result } = renderHook(() => useLocalSyncedAt(db, "t1"));
    await waitFor(() => expect(result.current).toEqual({ loaded: true, syncedAt: null }));

    await syncTrip(depsFor(db, 1000), "t1");
    await waitFor(() => expect(result.current.syncedAt).toBe(1000));

    await syncTrip(depsFor(db, 2000), "t1");
    await waitFor(() => expect(result.current.syncedAt).toBe(2000));

    await wipeTrip(db, "t1");
    await waitFor(() => expect(result.current.syncedAt).toBeNull());
  });

  it("ignores syncs of other trips", async () => {
    const db = openOfflineDb("hook-2");
    const { result } = renderHook(() => useLocalSyncedAt(db, "t1"));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await syncTrip(depsFor(db, 5000), "t2");
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current.syncedAt).toBeNull();
  });
});
