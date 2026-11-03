import type { DocumentSource, SnapshotResult, TripDocument, TripSnapshot, TripSource } from "@hoppin/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTrip } from "../src/app/useTrip";
import { openOfflineDb, type OfflineDb } from "../src/offline/db";
import { getLocalTrip } from "../src/offline/sync";

const doc: TripDocument = { id: "d1", tripId: "t1", itemId: null, ownerId: "riya", scope: "shared", storagePath: "t1/riya/d1-t.pdf", kind: "ticket", fileName: "t.pdf" };
const snapshot = (name = "Goa"): TripSnapshot => ({
  trip: { id: "t1", name, startDate: null, endDate: null },
  members: [{ userId: "me", role: "member", status: "approved", canEditAll: false, displayName: "Aman" }],
  items: [],
  rsvps: [],
  documents: [doc],
});

let db: OfflineDb;
let n = 0;
let result: SnapshotResult;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let fetchSnapshot: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let download: any;
const tripSource = (): TripSource => ({ fetchSnapshot: (id: string) => fetchSnapshot(id) });
const documentSource = (): DocumentSource => ({ download: (d: TripDocument) => download(d) });
const setOnline = (v: boolean) => vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(v);
const render = () => renderHook(() => useTrip({ db, tripSource: tripSource(), documentSource: documentSource() }, "t1", "me"));

beforeEach(() => {
  db = openOfflineDb(`usetrip-${(n += 1)}`);
  result = { status: "ok", snapshot: snapshot() };
  fetchSnapshot = vi.fn(async () => result);
  download = vi.fn(async () => ({ data: new ArrayBuffer(4), contentType: "application/pdf" }));
  setOnline(true);
});
afterEach(() => vi.restoreAllMocks());

describe("useTrip", () => {
  it("loads the trip from the server, stores it, and reports when it synced", async () => {
    const { result: r } = render();
    expect(r.current.phase).toBe("loading");
    await waitFor(() => expect(r.current.phase).toBe("ready"));
    expect(r.current.snapshot?.trip.name).toBe("Goa");
    expect(r.current.syncedAt).toBeGreaterThan(0);
    expect((await getLocalTrip(db, "t1"))?.snapshot.trip.name).toBe("Goa");
  });

  it("also downloads the trip's documents for offline use", async () => {
    const { result: r } = render();
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(r.current.syncing).toBe(false));
  });

  it("with no signal, shows the copy on the device and does not try the network", async () => {
    const first = render();
    await waitFor(() => expect(first.result.current.phase).toBe("ready"));
    first.unmount();
    fetchSnapshot.mockClear();
    setOnline(false);
    const { result: r } = render();
    await waitFor(() => expect(r.current.phase).toBe("ready"));
    expect(r.current.snapshot?.trip.name).toBe("Goa");
    expect(fetchSnapshot).not.toHaveBeenCalled();
  });

  it("if a refresh fails, keeps showing the copy on the device and says the sync failed", async () => {
    const first = render();
    await waitFor(() => expect(first.result.current.phase).toBe("ready"));
    first.unmount();
    fetchSnapshot.mockRejectedValue(new Error("server down"));
    const { result: r } = render();
    await waitFor(() => expect(r.current.syncFailed).toBe(true));
    expect(r.current.phase).toBe("ready");
    expect(r.current.snapshot?.trip.name).toBe("Goa");
  });

  it("with nothing on the device and a failed load, says the trip is unavailable", async () => {
    fetchSnapshot.mockRejectedValue(new Error("server down"));
    const { result: r } = render();
    await waitFor(() => expect(r.current.phase).toBe("unavailable"));
  });

  it("with no signal and nothing on the device, says the trip is unavailable", async () => {
    setOnline(false);
    const { result: r } = render();
    await waitFor(() => expect(r.current.phase).toBe("unavailable"));
  });

  it("when the person was removed, says so and wipes the copy", async () => {
    const first = render();
    await waitFor(() => expect(first.result.current.phase).toBe("ready"));
    first.unmount();
    result = { status: "no-access" };
    const { result: r } = render();
    await waitFor(() => expect(r.current.phase).toBe("removed"));
    expect(await getLocalTrip(db, "t1")).toBeNull();
  });

  it("refreshes again when the connection comes back, and on request", async () => {
    const { result: r } = render();
    await waitFor(() => expect(r.current.phase).toBe("ready"));
    await waitFor(() => expect(r.current.syncing).toBe(false));
    fetchSnapshot.mockClear();
    result = { status: "ok", snapshot: snapshot("Goa 2026") };
    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(r.current.snapshot?.trip.name).toBe("Goa 2026"));
    await waitFor(() => expect(r.current.syncing).toBe(false));
    await act(async () => {
      await r.current.refresh();
    });
    expect(fetchSnapshot).toHaveBeenCalledTimes(2);
  });
});
