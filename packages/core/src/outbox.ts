import { applyValues, overlayItem, type UpdateEdit } from "./edits";
import type { Item, ItemValues, TripSnapshot } from "./types";

/** Changes made on this device that are waiting to be sent to the server. */
export type OutboxRecord =
  | ({ kind: "update" } & UpdateEdit)
  | { kind: "create"; id: string; tripId: string; /** The id the item will have on the server. */ itemId: string; ownerId: string; values: ItemValues; at: number }
  | { kind: "delete"; id: string; tripId: string; itemId: string; itemTitle: string; at: number }
  | { kind: "rsvp"; id: string; tripId: string; itemId: string; userId: string; going: boolean; at: number };

export type UpdateRecord = Extract<OutboxRecord, { kind: "update" }>;
export type CreateRecord = Extract<OutboxRecord, { kind: "create" }>;
export type DeleteRecord = Extract<OutboxRecord, { kind: "delete" }>;
export type RsvpRecord = Extract<OutboxRecord, { kind: "rsvp" }>;

/** An item that exists only on this device so far. Version 0 marks it as not yet saved. */
export function itemFromValues(id: string, tripId: string, ownerId: string, values: ItemValues): Item {
  const blank: Item = {
    id, tripId, ownerId, kind: values.kind, visibility: values.visibility, groupItem: values.groupItem,
    startsAt: values.startsAt, endsAt: values.endsAt, tz: values.tz, title: values.title, locationUrl: values.locationUrl,
    details: {}, version: 0,
  };
  return applyValues(blank, values);
}

/** What the person should see: the saved trip with their waiting changes on top. The saved copy is not modified. */
export function overlaySnapshot(snapshot: TripSnapshot, outbox: OutboxRecord[]): TripSnapshot {
  const mine = outbox.filter((r) => r.tripId === snapshot.trip.id).sort((a, b) => a.at - b.at);
  const updates = mine.filter((r): r is UpdateRecord => r.kind === "update");
  const removed = new Set(mine.filter((r): r is DeleteRecord => r.kind === "delete").map((r) => r.itemId));
  const created = mine
    .filter((r): r is CreateRecord => r.kind === "create")
    .map((r) => itemFromValues(r.itemId, r.tripId, r.ownerId, r.values));

  const items = [...snapshot.items.map((i) => overlayItem(i, updates)), ...created]
    .filter((item) => !removed.has(item.id))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.title.localeCompare(b.title));

  let rsvps = snapshot.rsvps.filter((r) => !removed.has(r.itemId));
  for (const r of mine.filter((x): x is RsvpRecord => x.kind === "rsvp")) {
    rsvps = rsvps.filter((x) => !(x.itemId === r.itemId && x.userId === r.userId));
    if (r.going) rsvps = [...rsvps, { itemId: r.itemId, userId: r.userId }];
  }
  return { ...snapshot, items, rsvps };
}
