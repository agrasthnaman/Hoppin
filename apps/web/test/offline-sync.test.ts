import type { DocumentSource, Item, MemberInfo, SnapshotResult, TripDocument, TripSnapshot, TripSource } from "@hoppin/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDeviceKey } from "../src/offline/crypto";
import { openOfflineDb, type OfflineDb } from "../src/offline/db";
import {
  cacheDocuments,
  clearAllLocalData,
  getLocalDocument,
  getLocalTrip,
  syncTrip,
  wipeTrip,
  type OfflineDeps,
} from "../src/offline/sync";

const NOW = 1_800_000_000_000;
const ME = "me";
const member = (over: Partial<MemberInfo> = {}): MemberInfo => ({
  userId: ME,
  role: "member",
  status: "approved",
  canEditAll: false,
  displayName: "Aman",
  ...over,
});
const item = (id: string, title: string): Item => ({
  id,
  tripId: "t1",
  ownerId: ME,
  kind: "activity",
  visibility: "shared",
  groupItem: true,
  startsAt: "2026-12-01T04:30:00.000Z",
  endsAt: null,
  tz: "Asia/Kolkata",
  title,
  locationUrl: null,
  details: {},
  version: 1,
});
const doc = (id: string, over: Partial<TripDocument> = {}): TripDocument => ({
  id,
  tripId: "t1",
  itemId: null,
  ownerId: ME,
  scope: "shared",
  storagePath: `t1/me/${id}-file.pdf`,
  kind: "ticket",
  fileName: `${id}-file.pdf`,
  ...over,
});
const snapshot = (over: Partial<TripSnapshot> = {}): TripSnapshot => ({
  trip: { id: "t1", name: "Goa", startDate: "2026-12-01", endDate: "2026-12-05" },
  members: [member(), member({ userId: "riya", displayName: "Riya" }), member({ userId: "org", role: "organizer", displayName: "Neha" })],
  items: [item("i1", "Beach hotel")],
  rsvps: [{ itemId: "i1", userId: "riya" }],
  documents: [],
  ...over,
});

const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;
const text = async (blob: Blob | null) => (blob ? new TextDecoder().decode(await blob.arrayBuffer()) : null);

let db: OfflineDb;
let n = 0;
let result: SnapshotResult;
let source: TripSource & { fetchSnapshot: ReturnType<typeof vi.fn> };
let documents: DocumentSource & { download: ReturnType<typeof vi.fn> };
let deps: OfflineDeps;

beforeEach(() => {
  db = openOfflineDb(`sync-${(n += 1)}`);
  result = { status: "ok", snapshot: snapshot() };
  source = { fetchSnapshot: vi.fn(async () => result) };
  documents = { download: vi.fn(async (d: TripDocument) => ({ data: bytes(`contents of ${d.id}`), contentType: "application/pdf" })) };
  deps = { db, source, documents, viewerId: ME, now: () => NOW };
});

describe("syncTrip and getLocalTrip", () => {
  it("stores items, bookings, members and the sync time on the device", async () => {
    expect(await syncTrip(deps, "t1")).toEqual({ status: "synced", syncedAt: NOW });
    const local = await getLocalTrip(db, "t1");
    expect(local?.syncedAt).toBe(NOW);
    expect(local?.snapshot.items.map((i) => i.title)).toEqual(["Beach hotel"]);
    expect(local?.snapshot.members).toHaveLength(3);
    expect(local?.snapshot.rsvps).toEqual([{ itemId: "i1", userId: "riya" }]);
  });

  it("reads from the device alone, so it works with no network", async () => {
    await syncTrip(deps, "t1");
    source.fetchSnapshot.mockRejectedValue(new Error("offline"));
    documents.download.mockRejectedValue(new Error("offline"));
    expect((await getLocalTrip(db, "t1"))?.snapshot.trip.name).toBe("Goa");
    expect(source.fetchSnapshot).toHaveBeenCalledTimes(1);
  });

  it("returns null for a trip that was never synced", async () => {
    expect(await getLocalTrip(db, "nope")).toBeNull();
  });

  it("a failed sync reports the error and keeps what was there", async () => {
    await syncTrip(deps, "t1");
    source.fetchSnapshot.mockRejectedValue(new Error("network down"));
    await expect(syncTrip({ ...deps, now: () => NOW + 1000 }, "t1")).rejects.toThrow("network down");
    const local = await getLocalTrip(db, "t1");
    expect(local?.syncedAt).toBe(NOW);
    expect(local?.snapshot.items).toHaveLength(1);
  });

  it("a newer sync replaces the old data, including deleted items", async () => {
    await syncTrip(deps, "t1");
    result = { status: "ok", snapshot: snapshot({ items: [item("i2", "Museum")] }) };
    await syncTrip({ ...deps, now: () => NOW + 5000 }, "t1");
    const local = await getLocalTrip(db, "t1");
    expect(local?.snapshot.items.map((i) => i.id)).toEqual(["i2"]);
    expect(local?.syncedAt).toBe(NOW + 5000);
  });

  it("when the person was removed, the trip and its documents are wiped from the device", async () => {
    result = { status: "ok", snapshot: snapshot({ documents: [doc("d1")] }) };
    await syncTrip(deps, "t1");
    await cacheDocuments(deps, "t1");
    expect(await getLocalDocument(db, doc("d1"), await getDeviceKey(db))).not.toBeNull();

    result = { status: "no-access" };
    expect(await syncTrip(deps, "t1")).toEqual({ status: "removed" });
    expect(await getLocalTrip(db, "t1")).toBeNull();
    expect(await getLocalDocument(db, doc("d1"), await getDeviceKey(db))).toBeNull();
  });

  it("wiping one trip leaves other trips alone", async () => {
    await syncTrip(deps, "t1");
    result = { status: "ok", snapshot: snapshot({ trip: { id: "t2", name: "Manali", startDate: null, endDate: null } }) };
    await syncTrip(deps, "t2");
    await wipeTrip(db, "t1");
    expect(await getLocalTrip(db, "t1")).toBeNull();
    expect((await getLocalTrip(db, "t2"))?.snapshot.trip.name).toBe("Manali");
  });
});

describe("cacheDocuments", () => {
  const shared = doc("d1");
  const mine = doc("d2", { scope: "personal", kind: "passport" });
  const riyas = doc("d3", { scope: "personal", ownerId: "riya", kind: "passport" });

  async function setup(docs: TripDocument[]) {
    result = { status: "ok", snapshot: snapshot({ documents: docs }) };
    await syncTrip(deps, "t1");
    return getDeviceKey(db);
  }

  it("downloads shared documents and the person's own personal documents", async () => {
    const key = await setup([shared, mine, riyas]);
    expect(await cacheDocuments(deps, "t1")).toEqual({ cached: 2, failed: [], removed: 0 });
    expect(await text(await getLocalDocument(db, shared, key))).toBe("contents of d1");
    expect(await text(await getLocalDocument(db, mine, key))).toBe("contents of d2");
    expect(await getLocalDocument(db, riyas, key)).toBeNull();
    expect(documents.download).not.toHaveBeenCalledWith(riyas);
  });

  it("does not store other people's personal documents, even for the organizer", async () => {
    const orgDeps = { ...deps, viewerId: "org" };
    await setup([riyas]);
    expect(await cacheDocuments(orgDeps, "t1")).toEqual({ cached: 0, failed: [], removed: 0 });
    expect(documents.download).not.toHaveBeenCalled();
  });

  it("keeps personal documents encrypted on the device", async () => {
    await setup([mine, shared]);
    await cacheDocuments(deps, "t1");
    const storedPersonal = await db.blobs.get("d2");
    const storedShared = await db.blobs.get("d1");
    expect(storedPersonal?.encrypted).toBe(true);
    expect(await text(new Blob([storedPersonal!.data]))).not.toContain("contents of");
    expect(await text(new Blob([storedShared!.data]))).toBe("contents of d1");
    expect(storedShared?.encrypted).toBe(false);
  });

  it("cannot read a personal document without the right key", async () => {
    await setup([mine]);
    await cacheDocuments(deps, "t1");
    const otherKey = await getDeviceKey(openOfflineDb("some-other-device"));
    await expect(getLocalDocument(db, mine, otherKey)).rejects.toThrow();
  });

  it("does not download again what is already on the device", async () => {
    await setup([shared]);
    await cacheDocuments(deps, "t1");
    documents.download.mockClear();
    expect(await cacheDocuments(deps, "t1")).toEqual({ cached: 0, failed: [], removed: 0 });
    expect(documents.download).not.toHaveBeenCalled();
  });

  it("one failed download does not stop the others, and is retried next time", async () => {
    await setup([shared, mine]);
    documents.download.mockImplementationOnce(async () => {
      throw new Error("timeout");
    });
    const first = await cacheDocuments(deps, "t1");
    expect(first.cached).toBe(1);
    expect(first.failed).toEqual(["d1"]);
    const second = await cacheDocuments(deps, "t1");
    expect(second).toEqual({ cached: 1, failed: [], removed: 0 });
  });

  it("removes a document from the device when it is no longer in the trip", async () => {
    const key = await setup([shared, mine]);
    await cacheDocuments(deps, "t1");
    result = { status: "ok", snapshot: snapshot({ documents: [mine] }) };
    await syncTrip(deps, "t1");
    expect(await cacheDocuments(deps, "t1")).toEqual({ cached: 0, failed: [], removed: 1 });
    expect(await getLocalDocument(db, shared, key)).toBeNull();
    expect(await getLocalDocument(db, mine, key)).not.toBeNull();
  });

  it("does nothing for a trip that was never synced", async () => {
    expect(await cacheDocuments(deps, "t1")).toEqual({ cached: 0, failed: [], removed: 0 });
  });
});

describe("clearAllLocalData", () => {
  it("removes every trip, document and key from the device (for sign out)", async () => {
    result = { status: "ok", snapshot: snapshot({ documents: [doc("d1")] }) };
    await syncTrip(deps, "t1");
    await cacheDocuments(deps, "t1");
    await clearAllLocalData(db);
    const reopened = openOfflineDb(db.name);
    expect(await getLocalTrip(reopened, "t1")).toBeNull();
    expect(await reopened.blobs.count()).toBe(0);
    expect(await reopened.meta.count()).toBe(0);
  });
});
