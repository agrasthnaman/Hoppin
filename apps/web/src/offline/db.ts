import type { ConflictNotice, MoneyRecord, OutboxRecord, TripSnapshot } from "@hoppin/core";
import Dexie, { type Table } from "dexie";

export interface TripRecord {
  tripId: string;
  /** When this copy was fetched (ms since epoch). */
  syncedAt: number;
  snapshot: TripSnapshot;
}

export interface BlobRecord {
  /** Document id. */
  id: string;
  tripId: string;
  /** Personal documents are stored encrypted. */
  encrypted: boolean;
  contentType: string;
  data: ArrayBuffer;
  cachedAt: number;
}

export interface MetaRecord {
  key: string;
  value: unknown;
}

/** The copy of trips and documents kept on this device (IndexedDB). */
export class OfflineDb extends Dexie {
  trips!: Table<TripRecord, string>;
  blobs!: Table<BlobRecord, string>;
  meta!: Table<MetaRecord, string>;
  /** Changes made on this device, waiting to be sent. */
  outbox!: Table<OutboxRecord, string>;
  /** Changes that could not be applied; kept so the person can apply or discard them. */
  drafts!: Table<OutboxRecord, string>;
  notices!: Table<ConflictNotice, string>;
  /** Expenses, payments and guests added or changed on this device, waiting to be sent. */
  moneyOutbox!: Table<MoneyRecord, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({ trips: "tripId", blobs: "id, tripId", meta: "key" });
    this.version(2).stores({ outbox: "id, tripId", drafts: "id, tripId", notices: "id, tripId" });
    this.version(3).stores({ moneyOutbox: "id, tripId" });
  }
}

export function openOfflineDb(name = "hoppin"): OfflineDb {
  return new OfflineDb(name);
}

let shared: OfflineDb | undefined;
/** The one database the running app uses. */
export function sharedOfflineDb(): OfflineDb {
  return (shared ??= openOfflineDb());
}
