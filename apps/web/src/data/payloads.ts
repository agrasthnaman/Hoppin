import type { Item } from "@hoppin/core";
import type { ItemFormValues } from "../components/ItemForm";

function details(base: Record<string, unknown>, notes: string): Record<string, unknown> {
  const { notes: _old, ...rest } = base;
  return notes ? { ...rest, notes } : rest;
}

/** Row for a new item. The owner is always the signed-in person (the database enforces it too). */
export function itemInsertRow(tripId: string, ownerId: string, values: ItemFormValues) {
  return {
    trip_id: tripId,
    owner_id: ownerId,
    kind: values.kind,
    visibility: values.visibility,
    group_item: values.groupItem,
    starts_at: values.startsAt,
    ends_at: values.endsAt,
    tz: values.tz,
    title: values.title,
    location_url: values.locationUrl,
    details: details({}, values.notes),
  };
}

/** Changes for an existing item. Never includes trip or owner (they cannot change); other details are kept. */
export function itemUpdatePatch(item: Item, values: ItemFormValues) {
  const { trip_id: _t, owner_id: _o, ...rest } = itemInsertRow(item.tripId, item.ownerId, values);
  return { ...rest, details: details(item.details, values.notes) };
}
