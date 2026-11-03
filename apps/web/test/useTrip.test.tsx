import type { DocumentSource, Item, ItemValues, SnapshotResult, TripDocument, TripSnapshot, TripSource } from "@hoppin/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTrip } from "../src/app/useTrip";
import { openOfflineDb, type OfflineDb } from "../src/offline/db";
import type { Writer } from "../src/offline/outbox";
import { getLocalTrip } from "../src/offline/sync";

const doc: TripDocument = { id: "d1", tripId: "t1", itemId: null, ownerId: "riya", scope: "shared", storagePath: "t1/riya/d1-t.pdf", kind: "ticket", fileName: "t.pdf" };
const museum: Item = {
  id: "i1", tripId: "t1", ownerId: "me", kind: "activity", visibility: "shared", groupItem: false,
  startsAt: "2026-12-01T04:30:00.000Z", endsAt: null, tz: "Asia/Kolkata", title: "Museum", locationUrl: null,
  details: {}, version: 1, updatedAt: "2026-12-01T00:00:00.000Z",
};
const museumValues = (over: Partial<ItemValues> = {}): ItemValues => ({
  kind: "activity", title: "Museum", startsAt: "2026-12-01T04:30:00.000Z", endsAt: null, tz: "Asia/Kolkata",
  locationUrl: null, visibility: "shared", groupItem: false, notes: "", ...over,
});
const snapshot = (name = "Goa"): TripSnapshot => ({
  trip: { id: "t1", name, startDate: null, endDate: null },
  members: [{ userId: "me", role: "member", status: "approved", canEditAll: false, displayName: "Aman" }],
  items: [museum],
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let writer: any;
const tripSource = (): TripSource => ({ fetchSnapshot: (id: string) => fetchSnapshot(id) });
const documentSource = (): DocumentSource => ({ download: (d: TripDocument) => download(d) });
const setOnline = (v: boolean) => vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(v);
const render = () => renderHook(() => useTrip({ db, tripSource: tripSource(), documentSource: documentSource(), writer: writer as Writer }, "t1", "me"));

beforeEach(() => {
  db = openOfflineDb(`usetrip-${(n += 1)}`);
  result = { status: "ok", snapshot: snapshot() };
  fetchSnapshot = vi.fn(async () => result);
  download = vi.fn(async () => ({ data: new ArrayBuffer(4), contentType: "application/pdf" }));
  writer = { createItem: vi.fn(async () => {}), updateItem: vi.fn(async () => {}), setRsvp: vi.fn(async () => {}) };
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

describe("useTrip: changes made on this device", () => {
  async function readyOffline() {
    const first = render();
    await waitFor(() => expect(first.result.current.phase).toBe("ready"));
    await waitFor(() => expect(first.result.current.syncing).toBe(false));
    first.unmount();
    setOnline(false);
    const r = render();
    await waitFor(() => expect(r.result.current.phase).toBe("ready"));
    return r;
  }

  it("an edit with no signal shows at once, counts as waiting, and is sent when the connection returns", async () => {
    const { result: r } = await readyOffline();
    await act(async () => r.current.editItem(museum, museumValues({ title: "Museum (moved)" })));
    expect(r.current.snapshot?.items[0]?.title).toBe("Museum (moved)");
    expect(r.current.pendingCount).toBe(1);
    expect(writer.updateItem).not.toHaveBeenCalled();

    setOnline(true);
    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(writer.updateItem).toHaveBeenCalledTimes(1));
    expect(writer.updateItem.mock.calls[0][1]).toMatchObject({ title: "Museum (moved)" });
    await waitFor(() => expect(r.current.pendingCount).toBe(0));
  });

  it("a plan added with no signal appears at once and is sent with its final id later", async () => {
    const { result: r } = await readyOffline();
    await act(async () => void (await r.current.addItem(museumValues({ title: "Beach dinner", startsAt: "2026-12-01T14:00:00.000Z" }))));
    const added = r.current.snapshot?.items.find((i) => i.title === "Beach dinner");
    expect(added).toBeDefined();
    expect(r.current.pendingCount).toBe(1);

    setOnline(true);
    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(writer.createItem).toHaveBeenCalledTimes(1));
    expect(writer.createItem.mock.calls[0][3]).toBe(added!.id);
  });

  it("'I'm in' with no signal shows at once and is sent later", async () => {
    const { result: r } = await readyOffline();
    await act(async () => r.current.setGoing("i1", true));
    expect(r.current.snapshot?.rsvps).toEqual([{ itemId: "i1", userId: "me" }]);
    setOnline(true);
    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(writer.setRsvp).toHaveBeenCalledWith("i1", "me", true));
  });

  it("with a connection, an edit is sent straight away and nothing is left waiting", async () => {
    const { result: r } = render();
    await waitFor(() => expect(r.current.phase).toBe("ready"));
    await waitFor(() => expect(r.current.syncing).toBe(false));
    await act(async () => r.current.editItem(museum, museumValues({ title: "Moved" })));
    await waitFor(() => expect(writer.updateItem).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(r.current.pendingCount).toBe(0));
  });

  it("a rejected edit is kept as a draft, and the person can discard it or put it back", async () => {
    const { result: r } = render();
    await waitFor(() => expect(r.current.phase).toBe("ready"));
    await waitFor(() => expect(r.current.syncing).toBe(false));
    writer.updateItem.mockRejectedValueOnce(new Error("permission denied"));
    await act(async () => r.current.editItem(museum, museumValues({ title: "Moved" })));
    await waitFor(() => expect(r.current.drafts).toHaveLength(1));
    expect(r.current.notices).toHaveLength(1);
    expect(r.current.pendingCount).toBe(0);

    await act(async () => r.current.dismissNotice(r.current.notices[0]!.id));
    await waitFor(() => expect(r.current.notices).toHaveLength(0));

    await act(async () => r.current.applyDraft(r.current.drafts[0]!));
    await waitFor(() => expect(writer.updateItem).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(r.current.drafts).toHaveLength(0));
  });

  it("a draft can be discarded", async () => {
    const { result: r } = render();
    await waitFor(() => expect(r.current.phase).toBe("ready"));
    await waitFor(() => expect(r.current.syncing).toBe(false));
    writer.updateItem.mockRejectedValueOnce(new Error("permission denied"));
    await act(async () => r.current.editItem(museum, museumValues({ title: "Moved" })));
    await waitFor(() => expect(r.current.drafts).toHaveLength(1));
    await act(async () => r.current.discardDraft(r.current.drafts[0]!.id));
    await waitFor(() => expect(r.current.drafts).toHaveLength(0));
  });
});
