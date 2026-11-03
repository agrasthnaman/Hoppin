import type { Item, ItemValues, SnapshotResult, TripSnapshot, TripSource } from "@hoppin/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError } from "../src/data/writes";
import { openOfflineDb, type OfflineDb } from "../src/offline/db";
import {
  applyDraft, dismissNotice, discardDraft, flushOutbox, listDrafts, listNotices, listOutbox,
  queueCreate, queueItemEdit, queueRsvp, type OutboxDeps, type Writer,
} from "../src/offline/outbox";

const T_LATER = Date.parse("2026-12-01T11:00:00.000Z");
const T_EARLIER = Date.parse("2026-12-01T09:00:00.000Z");

const item = (over: Partial<Item> = {}): Item => ({
  id: "i1", tripId: "t1", ownerId: "me", kind: "activity", visibility: "shared", groupItem: false,
  startsAt: "2026-12-01T04:30:00.000Z", endsAt: null, tz: "Asia/Kolkata", title: "Museum", locationUrl: null,
  details: {}, version: 3, updatedAt: "2026-12-01T10:00:00.000Z", ...over,
});
const values = (over: Partial<ItemValues> = {}): ItemValues => ({
  kind: "activity", title: "Museum", startsAt: "2026-12-01T04:30:00.000Z", endsAt: null, tz: "Asia/Kolkata",
  locationUrl: null, visibility: "shared", groupItem: false, notes: "", ...over,
});
const snapshotOf = (items: Item[]): TripSnapshot => ({ trip: { id: "t1", name: "Goa", startDate: null, endDate: null }, members: [], items, rsvps: [], documents: [] });

let db: OfflineDb;
let n = 0;
let ids = 0;
let server: SnapshotResult | Error;
let writer: { [K in keyof Writer]: ReturnType<typeof vi.fn> };
let deps: OutboxDeps;
let fetchSnapshot: ReturnType<typeof vi.fn>;

beforeEach(() => {
  db = openOfflineDb(`outbox-${(n += 1)}`);
  ids = 0;
  server = { status: "ok", snapshot: snapshotOf([item()]) };
  fetchSnapshot = vi.fn(async () => {
    if (server instanceof Error) throw server;
    return server;
  });
  writer = { createItem: vi.fn(async () => {}), updateItem: vi.fn(async () => {}), setRsvp: vi.fn(async () => {}) };
  deps = { db, source: { fetchSnapshot } as unknown as TripSource, writer: writer as unknown as Writer, viewerId: "me", now: () => T_LATER, newId: () => `id${(ids += 1)}` };
});

const set = (items: Item[]) => (server = { status: "ok", snapshot: snapshotOf(items) });

describe("queueItemEdit", () => {
  it("stores one waiting edit per changed field, with the version and old value it started from", async () => {
    await queueItemEdit(deps, { tripId: "t1", item: item(), values: values({ title: "Museum (moved)", notes: "tickets" }) });
    const records = await listOutbox(db, "t1");
    expect(records).toHaveLength(2);
    expect(records).toContainEqual(expect.objectContaining({ kind: "update", itemId: "i1", field: "title", value: "Museum (moved)", baseValue: "Museum", baseVersion: 3, at: T_LATER }));
    expect(records).toContainEqual(expect.objectContaining({ field: "notes", value: "tickets", baseValue: "" }));
  });

  it("does nothing when nothing changed", async () => {
    await queueItemEdit(deps, { tripId: "t1", item: item(), values: values() });
    expect(await listOutbox(db, "t1")).toEqual([]);
  });

  it("editing the same field again replaces the waiting edit and keeps the original starting point", async () => {
    await queueItemEdit(deps, { tripId: "t1", item: item(), values: values({ title: "One" }) });
    await queueItemEdit(deps, { tripId: "t1", item: item({ title: "One" }), values: values({ title: "Two" }) });
    const records = await listOutbox(db, "t1");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ value: "Two", baseValue: "Museum", baseVersion: 3 });
  });

  it("an edit that puts the field back removes the waiting edit", async () => {
    await queueItemEdit(deps, { tripId: "t1", item: item(), values: values({ title: "One" }) });
    await queueItemEdit(deps, { tripId: "t1", item: item({ title: "One" }), values: values({ title: "Museum" }) });
    expect(await listOutbox(db, "t1")).toEqual([]);
  });

  it("editing a plan that only exists on this device changes the waiting plan instead", async () => {
    const itemId = await queueCreate(deps, { tripId: "t1", ownerId: "me", values: values({ title: "Draft plan" }) });
    await queueItemEdit(deps, { tripId: "t1", item: item({ id: itemId, title: "Draft plan", version: 0 }), values: values({ title: "Better name" }) });
    const records = await listOutbox(db, "t1");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ kind: "create", itemId, values: expect.objectContaining({ title: "Better name" }) });
  });
});

describe("queueCreate and queueRsvp", () => {
  it("a new plan gets its final id straight away", async () => {
    const id = await queueCreate(deps, { tripId: "t1", ownerId: "me", values: values({ title: "Beach dinner" }) });
    expect(id).toBe("id1");
    expect(await listOutbox(db, "t1")).toEqual([expect.objectContaining({ kind: "create", itemId: "id1", ownerId: "me" })]);
  });

  it("only the latest RSVP choice for an item is kept", async () => {
    await queueRsvp(deps, { tripId: "t1", itemId: "i1", userId: "me", going: true });
    await queueRsvp(deps, { tripId: "t1", itemId: "i1", userId: "me", going: false });
    expect(await listOutbox(db, "t1")).toEqual([expect.objectContaining({ kind: "rsvp", going: false })]);
  });
});

describe("flushOutbox", () => {
  it("sends plans, then edits, then RSVPs, and empties the outbox", async () => {
    await queueRsvp(deps, { tripId: "t1", itemId: "i1", userId: "me", going: true });
    await queueItemEdit(deps, { tripId: "t1", item: item(), values: values({ title: "Moved" }) });
    const newId = await queueCreate(deps, { tripId: "t1", ownerId: "me", values: values({ title: "Dinner" }) });
    const order: string[] = [];
    writer.createItem.mockImplementation(async () => void order.push("create"));
    writer.updateItem.mockImplementation(async () => void order.push("update"));
    writer.setRsvp.mockImplementation(async () => void order.push("rsvp"));

    expect(await flushOutbox(deps, "t1")).toEqual({ sent: 3, drafts: 0, notices: 0, deferred: false });
    expect(order).toEqual(["create", "update", "rsvp"]);
    expect(writer.createItem).toHaveBeenCalledWith("t1", "me", expect.objectContaining({ title: "Dinner" }), newId);
    expect(await listOutbox(db, "t1")).toEqual([]);
  });

  it("sends edits against the item as the server has it now, changing only the edited fields", async () => {
    set([item({ version: 7, locationUrl: "https://maps.example/x" })]); // someone else changed the location
    await queueItemEdit(deps, { tripId: "t1", item: item(), values: values({ title: "Moved" }) });
    await flushOutbox(deps, "t1");
    const [sentItem, sentValues] = writer.updateItem.mock.calls[0]!;
    expect(sentItem.version).toBe(7);
    expect(sentValues).toMatchObject({ title: "Moved", locationUrl: "https://maps.example/x" });
  });

  it("does not contact the server when there is nothing to send", async () => {
    expect(await flushOutbox(deps, "t1")).toEqual({ sent: 0, drafts: 0, notices: 0, deferred: false });
    expect(fetchSnapshot).not.toHaveBeenCalled();
  });

  it("if the server cannot be reached, keeps everything and says it was put off", async () => {
    await queueItemEdit(deps, { tripId: "t1", item: item(), values: values({ title: "Moved" }) });
    server = new TypeError("Failed to fetch");
    expect(await flushOutbox(deps, "t1")).toMatchObject({ sent: 0, deferred: true });
    expect(await listOutbox(db, "t1")).toHaveLength(1);
  });

  it("a network failure part-way keeps what was not sent and removes what was", async () => {
    await queueCreate(deps, { tripId: "t1", ownerId: "me", values: values({ title: "Dinner" }) });
    await queueRsvp(deps, { tripId: "t1", itemId: "i1", userId: "me", going: true });
    writer.setRsvp.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await flushOutbox(deps, "t1")).toMatchObject({ sent: 1, deferred: true });
    expect((await listOutbox(db, "t1")).map((r) => r.kind)).toEqual(["rsvp"]);
  });

  it("when someone else changed the same field later, theirs stays, the edit becomes a draft, and a notice says so; other fields still go", async () => {
    set([item({ version: 4, title: "Theirs", updatedAt: "2026-12-01T10:00:00.000Z" })]);
    await queueItemEdit(deps, { tripId: "t1", item: item(), values: values({ title: "Mine", notes: "tickets" }) });
    // the person edited before the other change happened
    const records = await listOutbox(db, "t1");
    await db.outbox.bulkPut(records.map((r) => ({ ...r, at: T_EARLIER })));

    const result = await flushOutbox(deps, "t1");
    expect(result).toMatchObject({ sent: 1, drafts: 1, notices: 1, deferred: false });
    expect(writer.updateItem.mock.calls[0]![1]).toMatchObject({ title: "Theirs", notes: "tickets" });
    expect((await listDrafts(db, "t1"))[0]).toMatchObject({ field: "title", value: "Mine" });
    expect((await listNotices(db, "t1"))[0]).toMatchObject({ kind: "lost", itemTitle: "Theirs" });
    expect(await listOutbox(db, "t1")).toEqual([]);
  });

  it("when the edit is newer than the other change, it wins and a notice says it replaced theirs", async () => {
    set([item({ version: 4, title: "Theirs" })]);
    await queueItemEdit(deps, { tripId: "t1", item: item(), values: values({ title: "Mine" }) });
    expect(await flushOutbox(deps, "t1")).toMatchObject({ sent: 1, drafts: 0, notices: 1 });
    expect(writer.updateItem.mock.calls[0]![1]).toMatchObject({ title: "Mine" });
    expect((await listNotices(db, "t1"))[0]).toMatchObject({ kind: "overwrote" });
  });

  it("when the item was deleted meanwhile, the edits are kept as a draft and the person is told", async () => {
    await queueItemEdit(deps, { tripId: "t1", item: item(), values: values({ title: "Moved", notes: "n" }) });
    set([]);
    expect(await flushOutbox(deps, "t1")).toMatchObject({ sent: 0, drafts: 2, notices: 1 });
    expect(writer.updateItem).not.toHaveBeenCalled();
    expect(await listDrafts(db, "t1")).toHaveLength(2);
    expect((await listNotices(db, "t1"))[0]).toMatchObject({ kind: "deleted", itemTitle: "Museum" });
  });

  it("when the server refuses an edit, it becomes a draft with a notice instead of retrying forever", async () => {
    await queueItemEdit(deps, { tripId: "t1", item: item(), values: values({ title: "Moved" }) });
    writer.updateItem.mockRejectedValue(new Error("new row violates row-level security policy"));
    expect(await flushOutbox(deps, "t1")).toMatchObject({ sent: 0, drafts: 1, notices: 1, deferred: false });
    expect((await listNotices(db, "t1"))[0]).toMatchObject({ kind: "rejected" });
    expect(await listOutbox(db, "t1")).toEqual([]);
  });

  it("a plan that was already saved by an earlier attempt counts as sent", async () => {
    await queueCreate(deps, { tripId: "t1", ownerId: "me", values: values({ title: "Dinner" }) });
    writer.createItem.mockRejectedValue(new Error('duplicate key value violates unique constraint "items_pkey"'));
    expect(await flushOutbox(deps, "t1")).toMatchObject({ sent: 1, drafts: 0 });
    expect(await listOutbox(db, "t1")).toEqual([]);
  });

  it("when another save got in first (the item's version changed), the edits stay waiting for the next try", async () => {
    await queueItemEdit(deps, { tripId: "t1", item: item(), values: values({ title: "Moved" }) });
    writer.updateItem.mockRejectedValue(new ConflictError());
    // first look: version 3; after the refused save: someone saved, so version 4
    fetchSnapshot.mockImplementationOnce(async () => ({ status: "ok", snapshot: snapshotOf([item({ version: 3 })]) }));
    fetchSnapshot.mockImplementationOnce(async () => ({ status: "ok", snapshot: snapshotOf([item({ version: 4 })]) }));
    expect(await flushOutbox(deps, "t1")).toMatchObject({ sent: 0, deferred: true });
    expect(await listOutbox(db, "t1")).toHaveLength(1);
  });

  it("when the save is refused and nothing changed on the server (for example no edit rights), it becomes a draft instead of waiting forever", async () => {
    await queueItemEdit(deps, { tripId: "t1", item: item(), values: values({ title: "Moved" }) });
    writer.updateItem.mockRejectedValue(new ConflictError()); // no row matched, same version both times
    expect(await flushOutbox(deps, "t1")).toMatchObject({ sent: 0, drafts: 1, notices: 1, deferred: false });
    expect((await listNotices(db, "t1"))[0]).toMatchObject({ kind: "rejected" });
    expect(await listOutbox(db, "t1")).toEqual([]);
  });

  it("a plan the server refuses becomes a draft with a notice", async () => {
    await queueCreate(deps, { tripId: "t1", ownerId: "me", values: values({ title: "Dinner" }) });
    writer.createItem.mockRejectedValue(new Error("permission denied"));
    expect(await flushOutbox(deps, "t1")).toMatchObject({ sent: 0, drafts: 1, notices: 1 });
    expect((await listDrafts(db, "t1"))[0]).toMatchObject({ kind: "create" });
  });
});

describe("drafts and notices", () => {
  async function makeDraft() {
    await queueItemEdit(deps, { tripId: "t1", item: item(), values: values({ title: "Moved" }) });
    set([]);
    await flushOutbox(deps, "t1");
    return (await listDrafts(db, "t1"))[0]!;
  }

  it("applying a draft queues it again against the current item, as a newer edit", async () => {
    const draft = await makeDraft();
    expect(await applyDraft(deps, draft, item({ version: 9, title: "Theirs" }))).toBe("queued");
    expect(await listDrafts(db, "t1")).toEqual([]);
    expect((await listOutbox(db, "t1"))[0]).toMatchObject({ kind: "update", field: "title", value: "Moved", baseValue: "Theirs", baseVersion: 9, at: T_LATER });
  });

  it("a draft for an item that is gone cannot be applied, and stays", async () => {
    const draft = await makeDraft();
    expect(await applyDraft(deps, draft, undefined)).toBe("gone");
    expect(await listDrafts(db, "t1")).toHaveLength(1);
  });

  it("discarding a draft and dismissing a notice remove them", async () => {
    const draft = await makeDraft();
    await discardDraft(db, draft.id);
    await dismissNotice(db, (await listNotices(db, "t1"))[0]!.id);
    expect(await listDrafts(db, "t1")).toEqual([]);
    expect(await listNotices(db, "t1")).toEqual([]);
  });
});
