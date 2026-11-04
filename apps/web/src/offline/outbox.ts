import {
  coalesce,
  diffItem,
  reconcile,
  valuesOf,
  type ConflictNotice,
  type CreateRecord,
  type Item,
  type ItemValues,
  type OutboxRecord,
  type RsvpRecord,
  type TripSource,
  type UpdateEdit,
  type UpdateRecord,
} from "@hoppin/core";
import { ConflictError } from "../data/writes";
import type { OfflineDb } from "./db";
import { announceChange } from "./events";

/** What the outbox needs from the server side. */
export interface Writer {
  createItem(tripId: string, ownerId: string, values: ItemValues, id: string): Promise<void>;
  updateItem(item: Item, values: ItemValues): Promise<void>;
  setRsvp(itemId: string, userId: string, going: boolean): Promise<void>;
}

export interface OutboxDeps {
  db: OfflineDb;
  source: TripSource;
  writer: Writer;
  viewerId: string;
  now?: () => number;
  newId?: () => string;
}

type QueueDeps = Pick<OutboxDeps, "db" | "now" | "newId">;
const clock = (d: QueueDeps) => (d.now ?? Date.now)();
const makeId = (d: QueueDeps) => (d.newId ?? (() => crypto.randomUUID()))();
const asEdit = ({ kind: _kind, ...edit }: UpdateRecord): UpdateEdit => edit;
const asRecord = (edit: UpdateEdit): UpdateRecord => ({ kind: "update", ...edit });

export const listOutbox = (db: OfflineDb, tripId: string) => db.outbox.where("tripId").equals(tripId).toArray();
export const listDrafts = (db: OfflineDb, tripId: string) => db.drafts.where("tripId").equals(tripId).toArray();
export const listNotices = (db: OfflineDb, tripId: string) => db.notices.where("tripId").equals(tripId).toArray();
export async function dismissNotice(db: OfflineDb, id: string): Promise<void> {
  const notice = await db.notices.get(id);
  await db.notices.delete(id);
  if (notice) announceChange(notice.tripId);
}
export async function discardDraft(db: OfflineDb, id: string): Promise<void> {
  const draft = await db.drafts.get(id);
  await db.drafts.delete(id);
  if (draft) announceChange(draft.tripId);
}

/**
 * Queues the changes between what the person saw (`item`, with waiting edits on top) and what they saved. Each changed
 * field becomes one waiting edit. Editing a plan that exists only on this device changes the waiting plan instead.
 */
export async function queueItemEdit(deps: QueueDeps, args: { tripId: string; item: Item; values: ItemValues }): Promise<void> {
  const { db } = deps;
  const { tripId, item, values } = args;
  await db.transaction("rw", db.outbox, async () => {
    const mine = await db.outbox.where("tripId").equals(tripId).toArray();
    const pendingCreate = mine.find((r): r is CreateRecord => r.kind === "create" && r.itemId === item.id);
    if (pendingCreate) {
      await db.outbox.put({ ...pendingCreate, values });
      return;
    }
    const existing = mine.filter((r): r is UpdateRecord => r.kind === "update" && r.itemId === item.id);
    let queue = existing.map(asEdit);
    for (const change of diffItem(item, values)) {
      queue = coalesce(queue, {
        id: makeId(deps), tripId, itemId: item.id, itemTitle: item.title, field: change.field,
        value: change.value, baseValue: change.baseValue, baseVersion: item.version, at: clock(deps),
      });
    }
    await db.outbox.bulkDelete(existing.map((r) => r.id));
    await db.outbox.bulkPut(queue.map(asRecord));
  });
  announceChange(tripId);
}

/** Queues a new plan. It gets its final id now, so nothing needs renaming when it is saved. Returns that id. */
export async function queueCreate(deps: QueueDeps, args: { tripId: string; ownerId: string; values: ItemValues }): Promise<string> {
  const itemId = makeId(deps);
  await deps.db.outbox.put({ kind: "create", id: makeId(deps), tripId: args.tripId, itemId, ownerId: args.ownerId, values: args.values, at: clock(deps) });
  announceChange(args.tripId);
  return itemId;
}

/** Queues "I'm in" or "I'm out". Only the latest choice per item is kept. */
export async function queueRsvp(deps: QueueDeps, args: { tripId: string; itemId: string; userId: string; going: boolean }): Promise<void> {
  const { db } = deps;
  await db.transaction("rw", db.outbox, async () => {
    const old = (await db.outbox.where("tripId").equals(args.tripId).toArray()).filter(
      (r): r is RsvpRecord => r.kind === "rsvp" && r.itemId === args.itemId && r.userId === args.userId,
    );
    await db.outbox.bulkDelete(old.map((r) => r.id));
    await db.outbox.put({ kind: "rsvp", id: makeId(deps), ...args, at: clock(deps) });
  });
  announceChange(args.tripId);
}

/** Puts a kept draft back in the queue as a newer change on top of the item as it is now. */
export async function applyDraft(deps: QueueDeps, draft: OutboxRecord, current: Item | undefined): Promise<"queued" | "gone"> {
  const outcome = await putDraftBack(deps, draft, current);
  if (outcome === "queued") announceChange(draft.tripId);
  return outcome;
}

async function putDraftBack(deps: QueueDeps, draft: OutboxRecord, current: Item | undefined): Promise<"queued" | "gone"> {
  const { db } = deps;
  if (draft.kind === "create") {
    await db.transaction("rw", db.outbox, db.drafts, async () => {
      await db.drafts.delete(draft.id);
      await db.outbox.put({ ...draft, at: clock(deps) });
    });
    return "queued";
  }
  if (draft.kind !== "update" || !current) return "gone";
  await db.transaction("rw", db.outbox, db.drafts, async () => {
    await db.drafts.delete(draft.id);
    const existing = (await db.outbox.where("tripId").equals(draft.tripId).toArray()).filter(
      (r): r is UpdateRecord => r.kind === "update" && r.itemId === draft.itemId,
    );
    const queue = coalesce(existing.map(asEdit), {
      id: makeId(deps), tripId: draft.tripId, itemId: draft.itemId, itemTitle: current.title, field: draft.field,
      value: draft.value, baseValue: valuesOf(current)[draft.field], baseVersion: current.version, at: clock(deps),
    });
    await db.outbox.bulkDelete(existing.map((r) => r.id));
    await db.outbox.bulkPut(queue.map(asRecord));
  });
  return "queued";
}

export interface FlushResult {
  sent: number;
  drafts: number;
  notices: number;
  /** The connection (or another save getting in first) stopped it; what is left will be tried again. */
  deferred: boolean;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const isDuplicate = (e: unknown) => /duplicate key/i.test(errorText(e));
export const isRetryLater = (e: unknown) =>
  e instanceof TypeError ||
  (typeof navigator !== "undefined" && navigator.onLine === false) ||
  /failed to fetch|network|timed? ?out|fetch failed/i.test(errorText(e));

/**
 * Sends the waiting changes: new plans first, then edits (checked against the item as the server has it now), then
 * RSVPs. Nothing is ever dropped: whatever cannot be applied is kept as a draft with a notice.
 */
export async function flushOutbox(deps: OutboxDeps, tripId: string): Promise<FlushResult> {
  const result = await sendOutbox(deps, tripId);
  if (result.sent + result.drafts + result.notices > 0) announceChange(tripId);
  return result;
}

async function sendOutbox(deps: OutboxDeps, tripId: string): Promise<FlushResult> {
  const { db, writer } = deps;
  const result: FlushResult = { sent: 0, drafts: 0, notices: 0, deferred: false };
  const records = await listOutbox(db, tripId);
  if (records.length === 0) return result;

  let fresh;
  try {
    fresh = await deps.source.fetchSnapshot(tripId);
  } catch {
    return { ...result, deferred: true };
  }
  if (fresh.status === "no-access") return result; // the next sync removes everything from this device

  const server = fresh.snapshot.items;
  const keepAsDraft = async (recs: OutboxRecord[], notice: ConflictNotice) => {
    await db.transaction("rw", db.outbox, db.drafts, db.notices, async () => {
      await db.outbox.bulkDelete(recs.map((r) => r.id));
      await db.drafts.bulkPut(recs);
      await db.notices.put(notice);
    });
    result.drafts += recs.length;
    result.notices += 1;
  };
  const rejected = (rec: OutboxRecord, title: string, field: ConflictNotice["field"], mine: unknown): ConflictNotice => ({
    id: rec.id, tripId, itemId: rec.itemId, itemTitle: title, field, kind: "rejected", mine, theirs: null, at: rec.at,
  });

  // 1. new plans
  for (const c of records.filter((r): r is CreateRecord => r.kind === "create").sort((a, b) => a.at - b.at)) {
    try {
      await writer.createItem(tripId, c.ownerId, c.values, c.itemId);
      await db.outbox.delete(c.id);
      result.sent += 1;
    } catch (e) {
      if (isDuplicate(e)) {
        await db.outbox.delete(c.id); // an earlier attempt already saved it
        result.sent += 1;
      } else if (isRetryLater(e)) return { ...result, deferred: true };
      else await keepAsDraft([c], rejected(c, c.values.title, "title", c.values.title));
    }
  }

  // 2. edits
  const updates = records.filter((r): r is UpdateRecord => r.kind === "update");
  const decided = reconcile(updates.map(asEdit), server);
  const byId = new Map(updates.map((u) => [u.id, u]));
  const draftIds = new Set(decided.drafts.map((d) => d.id));
  if (decided.drafts.length > 0 || decided.notices.length > 0) {
    await db.transaction("rw", db.outbox, db.drafts, db.notices, async () => {
      await db.outbox.bulkDelete([...draftIds]);
      await db.drafts.bulkPut(decided.drafts.map((d) => byId.get(d.id)!));
      await db.notices.bulkPut(decided.notices);
    });
    result.drafts += decided.drafts.length;
    result.notices += decided.notices.length;
  }
  const groups = new Map<string, UpdateEdit[]>();
  for (const e of decided.apply) groups.set(e.itemId, [...(groups.get(e.itemId) ?? []), e]);
  for (const [itemId, edits] of groups) {
    const current = server.find((i) => i.id === itemId)!;
    const values = { ...valuesOf(current) } as Record<string, unknown>;
    for (const e of edits.sort((a, b) => a.at - b.at)) values[e.field] = e.value;
    try {
      await writer.updateItem(current, values as unknown as ItemValues);
      await db.outbox.bulkDelete(edits.map((e) => e.id));
      result.sent += edits.length;
    } catch (e) {
      if (isRetryLater(e)) return { ...result, deferred: true };
      if (e instanceof ConflictError) {
        // No row matched. Either someone saved in between (the version moved on: try again next time), or the
        // server will never accept this (for example no edit rights): then keep it as a draft instead of waiting forever.
        const latest = await deps.source.fetchSnapshot(tripId).catch(() => null);
        const now = latest?.status === "ok" ? latest.snapshot.items.find((i) => i.id === itemId) : undefined;
        if (!latest || (now && now.version !== current.version)) return { ...result, deferred: true };
      }
      await keepAsDraft(edits.map((x) => byId.get(x.id)!), rejected(byId.get(edits[0]!.id)!, current.title, edits[0]!.field, edits[0]!.value));
    }
  }

  // 3. RSVPs
  for (const r of records.filter((x): x is RsvpRecord => x.kind === "rsvp").sort((a, b) => a.at - b.at)) {
    try {
      await writer.setRsvp(r.itemId, r.userId, r.going);
      await db.outbox.delete(r.id);
      result.sent += 1;
    } catch (e) {
      if (isRetryLater(e)) return { ...result, deferred: true };
      const title = server.find((i) => i.id === r.itemId)?.title ?? "A plan";
      await db.transaction("rw", db.outbox, db.notices, async () => {
        await db.outbox.delete(r.id);
        await db.notices.put(rejected(r, title, "title", title));
      });
      result.notices += 1;
    }
  }
  return result;
}
