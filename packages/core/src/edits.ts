import type { Item, ItemValues } from "./types";

export type EditableField = keyof ItemValues;

/** One field of one item changed on this device and not yet sent to the server. */
export interface UpdateEdit {
  id: string;
  tripId: string;
  itemId: string;
  /** The item's title when the edit was made, for messages if the item is later deleted. */
  itemTitle?: string;
  field: EditableField;
  value: unknown;
  /** The field's value, and the item's version, when this device last saw them. */
  baseValue: unknown;
  baseVersion: number;
  /** When the person made the edit on their device (ms since epoch). */
  at: number;
}

export interface FieldChange {
  field: EditableField;
  value: unknown;
  baseValue: unknown;
}

export interface ConflictNotice {
  id: string;
  tripId: string;
  itemId: string;
  itemTitle: string;
  field: EditableField;
  kind: "deleted" | "overwrote" | "lost" | "rejected";
  /** What this person typed, and what is on the server. */
  mine: unknown;
  theirs: unknown;
  at: number;
}

const FIELDS: EditableField[] = ["kind", "title", "startsAt", "endsAt", "tz", "endTz", "locationUrl", "visibility", "groupItem", "notes"];

const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);

export function valuesOf(item: Item): ItemValues {
  return {
    kind: item.kind,
    title: item.title,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    tz: item.tz,
    endTz: item.endTz ?? null,
    locationUrl: item.locationUrl,
    visibility: item.visibility,
    groupItem: item.groupItem,
    notes: typeof item.details.notes === "string" ? item.details.notes : "",
    ...(typeof item.details.pollId === "string" ? { pollId: item.details.pollId } : {}),
  };
}

/** The fields whose value differs between an item and a set of new values. */
export function diffItem(item: Item, next: ItemValues): FieldChange[] {
  const before = valuesOf(item);
  return FIELDS.filter((f) => !same(before[f], next[f])).map((field) => ({ field, value: next[field], baseValue: before[field] }));
}

/** An item with new values applied. Other details are kept, and an emptied note is removed. Version is unchanged. */
export function applyValues(item: Item, values: ItemValues): Item {
  const { notes: _old, ...rest } = item.details;
  return {
    ...item,
    kind: values.kind,
    title: values.title,
    startsAt: values.startsAt,
    endsAt: values.endsAt,
    tz: values.tz,
    endTz: values.endTz ?? null,
    locationUrl: values.locationUrl,
    visibility: values.visibility,
    groupItem: values.groupItem,
    details: withPoll(values.notes ? { ...rest, notes: values.notes } : rest, values.pollId),
  };
}

function withPoll(details: Record<string, unknown>, pollId: string | undefined): Record<string, unknown> {
  if (!pollId) return details;
  return { ...details, pollId };
}

/** What to show for an item: the saved item with this device's waiting edits on top (oldest first). */
export function overlayItem(item: Item, edits: UpdateEdit[]): Item {
  return edits
    .filter((e) => e.itemId === item.id)
    .sort((a, b) => a.at - b.at)
    .reduce((current, e) => applyValues(current, { ...valuesOf(current), [e.field]: e.value }), item);
}

/**
 * Adds an edit to the waiting list. A newer edit of the same field replaces the older one but keeps the original
 * starting point; an edit that puts a field back where it started cancels out.
 */
export function coalesce(queue: UpdateEdit[], edit: UpdateEdit): UpdateEdit[] {
  const existing = queue.find((q) => q.itemId === edit.itemId && q.field === edit.field);
  const rest = queue.filter((q) => q !== existing);
  if (!existing) return [...rest, edit];
  if (same(edit.value, existing.baseValue)) return rest;
  return [...rest, { ...edit, baseValue: existing.baseValue, baseVersion: existing.baseVersion }];
}

export interface Reconciled {
  /** Edits to send now. */
  apply: UpdateEdit[];
  notices: ConflictNotice[];
  /** Edits that were not applied and are kept so the person can apply or discard them. */
  drafts: UpdateEdit[];
}

/**
 * Decides what to do with waiting edits given the server's current items. Edits to fields nobody else touched
 * apply. If someone changed the same field, the later change wins (compared by time). If the item was deleted,
 * the edits are kept as drafts. Every edit ends up applied or kept as a draft, never dropped.
 */
export function reconcile(edits: UpdateEdit[], serverItems: Item[]): Reconciled {
  const byId = new Map(serverItems.map((s) => [s.id, s]));
  const result: Reconciled = { apply: [], notices: [], drafts: [] };
  const deletedNoticed = new Set<string>();

  for (const e of edits) {
    const server = byId.get(e.itemId);
    if (!server) {
      result.drafts.push(e);
      if (!deletedNoticed.has(e.itemId)) {
        deletedNoticed.add(e.itemId);
        result.notices.push({ id: e.id, tripId: e.tripId, itemId: e.itemId, itemTitle: e.itemTitle ?? "This item", field: e.field, kind: "deleted", mine: e.value, theirs: null, at: e.at });
      }
      continue;
    }
    const current = valuesOf(server)[e.field];
    if (e.baseVersion === server.version || same(current, e.baseValue) || same(current, e.value)) {
      result.apply.push(e);
      continue;
    }
    // Same field changed by someone else since this device last saw it.
    const serverTime = server.updatedAt ? Date.parse(server.updatedAt) : Number.NaN;
    const mineIsNewer = !Number.isNaN(serverTime) && e.at > serverTime;
    (mineIsNewer ? result.apply : result.drafts).push(e);
    result.notices.push({ id: e.id, tripId: e.tripId, itemId: e.itemId, itemTitle: server.title, field: e.field, kind: mineIsNewer ? "overwrote" : "lost", mine: e.value, theirs: current, at: e.at });
  }
  return result;
}

const FIELD_LABEL: Record<EditableField, string> = {
  kind: "type",
  title: "title",
  startsAt: "start time",
  endsAt: "end time",
  tz: "time zone",
  endTz: "arrival time zone",
  locationUrl: "location link",
  visibility: "visibility",
  groupItem: "audience",
  notes: "notes",
  pollId: "poll",
};

export function fieldLabel(field: EditableField): string {
  return FIELD_LABEL[field];
}

/** A plain-language message for a conflict notice. */
export function describeNotice(n: ConflictNotice): string {
  if (n.kind === "rejected") return `"${n.itemTitle}" couldn't be saved: the server refused it. Your changes are saved as a draft.`;
  if (n.kind === "deleted") return `"${n.itemTitle}" was deleted while you were offline. Your changes are saved as a draft.`;
  if (n.kind === "overwrote") return `Your change to the ${fieldLabel(n.field)} of "${n.itemTitle}" replaced someone else's change.`;
  return `Someone else changed the ${fieldLabel(n.field)} of "${n.itemTitle}" after you, so your change wasn't applied. It's saved as a draft.`;
}
