import { visibleDocuments, type DocumentSource, type TripDocument, type TripSnapshot, type TripSource } from "@hoppin/core";
import { decryptBlob, encryptBlob, getDeviceKey } from "./crypto";
import type { OfflineDb } from "./db";

export interface OfflineDeps {
  db: OfflineDb;
  source: TripSource;
  documents: DocumentSource;
  /** The signed-in person; decides which personal documents are kept on this device. */
  viewerId: string;
  now?: () => number;
}

export type SyncResult = { status: "synced"; syncedAt: number } | { status: "removed" };

/** Tells screens that what is on the device changed, so "last synced" updates. */
function announce(tripId: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("hoppin:synced", { detail: { tripId } }));
}

/**
 * Refreshes a trip from the server and stores it on the device. If the request fails, it throws and the
 * existing copy is left untouched. If the person has lost access (removed), the trip and its documents are
 * wiped from the device.
 */
export async function syncTrip(deps: OfflineDeps, tripId: string): Promise<SyncResult> {
  const result = await deps.source.fetchSnapshot(tripId);
  if (result.status === "no-access") {
    await wipeTrip(deps.db, tripId);
    return { status: "removed" };
  }
  const syncedAt = (deps.now ?? Date.now)();
  await deps.db.trips.put({ tripId, syncedAt, snapshot: result.snapshot });
  announce(tripId);
  return { status: "synced", syncedAt };
}

/** The copy of a trip on this device. Reads only local storage, so it works with no network. */
export async function getLocalTrip(db: OfflineDb, tripId: string): Promise<{ snapshot: TripSnapshot; syncedAt: number } | null> {
  const record = await db.trips.get(tripId);
  return record ? { snapshot: record.snapshot, syncedAt: record.syncedAt } : null;
}

export interface CacheResult {
  cached: number;
  /** Ids of documents that could not be downloaded this time (they are retried on the next call). */
  failed: string[];
  removed: number;
}

/**
 * Keeps document files on the device: shared documents and the person's own personal documents.
 * Other people's personal documents are never stored here, even for the organizer. Personal ones are
 * stored encrypted. Files no longer in the trip are removed.
 */
export async function cacheDocuments(deps: OfflineDeps, tripId: string): Promise<CacheResult> {
  const local = await getLocalTrip(deps.db, tripId);
  const none: CacheResult = { cached: 0, failed: [], removed: 0 };
  if (!local) return none;
  const me = local.snapshot.members.find((m) => m.userId === deps.viewerId);
  if (!me || me.status !== "approved") return none;

  const wanted = visibleDocuments(local.snapshot.documents, me).filter(
    (d) => d.scope === "shared" || d.ownerId === deps.viewerId,
  );
  const wantedIds = new Set(wanted.map((d) => d.id));
  const stored = await deps.db.blobs.where("tripId").equals(tripId).toArray();
  const storedIds = new Set(stored.map((b) => b.id));

  const stale = stored.filter((b) => !wantedIds.has(b.id)).map((b) => b.id);
  await deps.db.blobs.bulkDelete(stale);

  const result: CacheResult = { cached: 0, failed: [], removed: stale.length };
  for (const doc of wanted.filter((d) => !storedIds.has(d.id))) {
    try {
      const { data, contentType } = await deps.documents.download(doc);
      const personal = doc.scope === "personal";
      await deps.db.blobs.put({
        id: doc.id,
        tripId,
        encrypted: personal,
        contentType,
        data: personal ? await encryptBlob(await getDeviceKey(deps.db), data) : data,
        cachedAt: (deps.now ?? Date.now)(),
      });
      result.cached += 1;
    } catch {
      result.failed.push(doc.id);
    }
  }
  return result;
}

/** A stored document file, decrypted if needed, or null if it is not on this device. Throws if the key is wrong. */
export async function getLocalDocument(db: OfflineDb, doc: TripDocument, key: CryptoKey): Promise<Blob | null> {
  const record = await db.blobs.get(doc.id);
  if (!record) return null;
  const data = record.encrypted ? await decryptBlob(key, record.data) : record.data;
  return new Blob([data], { type: record.contentType });
}

/** Removes one trip and its documents from this device. */
export async function wipeTrip(db: OfflineDb, tripId: string): Promise<void> {
  await db.transaction("rw", db.trips, db.blobs, async () => {
    await db.trips.delete(tripId);
    await db.blobs.where("tripId").equals(tripId).delete();
  });
  announce(tripId);
}

/** Removes everything, including the device key, and leaves an empty database ready to use. Call on sign out. */
export async function clearAllLocalData(db: OfflineDb): Promise<void> {
  await db.delete();
  await db.open();
}
