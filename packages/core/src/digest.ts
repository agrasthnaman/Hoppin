// Imports nothing, so the send-digest Edge Function (Deno) can import this file directly.

/** One row of the database `change_log`: an item as it was before and after one write. */
export interface ChangeLogEntry {
  id: number;
  tripId: string;
  itemId: string | null;
  actorId: string | null;
  op: "insert" | "update" | "delete";
  changedAt: string;
  /** The item row (snake_case columns) before the write; null for an insert. */
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  /** 'shared' only if the item was shared before and after the write. */
  itemVisibility: "private" | "shared";
  itemOwnerId: string | null;
}

export type DigestField = "title" | "kind" | "time" | "end" | "place" | "details";

/** `details` carries no values: booking details may hold references that do not belong in an email. */
export interface DigestFieldChange {
  field: DigestField;
  before: string | null;
  after: string | null;
}

export interface DigestChange {
  itemId: string;
  op: "added" | "changed" | "removed";
  title: string;
  kind: string;
  tz: string;
  /** Start of the item after the change (before it, for a removal). */
  startsAt: string | null;
  fields: DigestFieldChange[];
  /** Who made the changes, in order, without repeats. */
  by: string[];
  at: string;
}

export interface Digest {
  recipientId: string;
  tripId: string;
  windowStart: string;
  windowEnd: string;
  changes: DigestChange[];
}

/** A change as stored for the app: with the names of who made it, as they were at the time. */
export type NotifiedChange = DigestChange & { byNames: string[] };

/** One saved digest, as a member reads it. */
export interface TripNotification {
  id: string;
  createdAt: string;
  readAt: string | null;
  changes: NotifiedChange[];
}

const COLUMNS: [DigestField, string][] = [
  ["title", "title"],
  ["kind", "kind"],
  ["time", "starts_at"],
  ["end", "ends_at"],
  ["place", "location_url"],
];

/**
 * The leading entries (in log order) that fall inside the window opened by the first one. Stopping at the first entry
 * outside it, instead of skipping over it, means an entry logged late is never passed by and lost.
 */
export function takeWindow(entries: readonly ChangeLogEntry[], windowMs: number): ChangeLogEntry[] {
  if (entries.length === 0) return [];
  const end = Date.parse(entries[0]!.changedAt) + windowMs;
  const taken: ChangeLogEntry[] = [];
  for (const e of entries) {
    if (Date.parse(e.changedAt) >= end) break;
    taken.push(e);
  }
  return taken;
}

/** Whether a person may hear about a log entry: the same rule the database uses for reading `change_log`. */
function visibleTo(e: ChangeLogEntry, recipientId: string): boolean {
  return e.actorId !== recipientId && (e.itemVisibility === "shared" || e.itemOwnerId === recipientId);
}

const text = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function fieldChanges(before: Record<string, unknown>, after: Record<string, unknown>): DigestFieldChange[] {
  const fields: DigestFieldChange[] = [];
  for (const [field, column] of COLUMNS) {
    if (!same(before[column], after[column])) fields.push({ field, before: text(before[column]), after: text(after[column]) });
  }
  if (!same(before.details, after.details)) fields.push({ field: "details", before: null, after: null });
  return fields;
}

/**
 * What one person should hear about the changes in one window of one trip's log (entries in log order).
 * Several writes to one item become one change from its first state to its last. Null when nothing they may see changed.
 */
export function buildDigest(changes: readonly ChangeLogEntry[], recipientId: string, windowMs: number): Digest | null {
  const windowed = takeWindow(changes, windowMs);
  if (windowed.length === 0) return null;
  const first = windowed[0]!;
  const byItem = new Map<string, ChangeLogEntry[]>();
  for (const e of windowed) {
    if (e.tripId !== first.tripId || !e.itemId || !visibleTo(e, recipientId)) continue;
    const list = byItem.get(e.itemId);
    if (list) list.push(e);
    else byItem.set(e.itemId, [e]);
  }

  const out: DigestChange[] = [];
  for (const [itemId, list] of byItem) {
    const head = list[0]!;
    const tail = list[list.length - 1]!;
    const created = head.op === "insert";
    const removed = tail.op === "delete";
    if (created && removed) continue;
    const before = head.before ?? {};
    const after = tail.after ?? {};
    const shown = removed ? before : after;
    const fields = created || removed ? [] : fieldChanges(before, after);
    if (!created && !removed && fields.length === 0) continue;
    out.push({
      itemId,
      op: created ? "added" : removed ? "removed" : "changed",
      title: text(shown.title) ?? "A plan",
      kind: text(shown.kind) ?? "plan",
      tz: text(shown.tz) ?? "UTC",
      startsAt: text(shown.starts_at),
      fields,
      by: [...new Set(list.map((e) => e.actorId).filter((a): a is string => a !== null))],
      at: tail.changedAt,
    });
  }
  if (out.length === 0) return null;
  return {
    recipientId,
    tripId: first.tripId,
    windowStart: first.changedAt,
    windowEnd: new Date(Date.parse(first.changedAt) + windowMs).toISOString(),
    changes: out,
  };
}

const LABELS: Record<DigestField, string> = { title: "Name", kind: "Type", time: "Time", end: "Ends", place: "Place", details: "Booking details" };

/** `Tue 1 Dec, 14:00` in the item's own time zone. */
function when(iso: string, tz: string): string {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(date);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  return `${day}, ${time}`;
}

function show(field: DigestField, value: string | null, tz: string): string {
  if (value === null) return "none";
  return field === "time" || field === "end" ? when(value, tz) : value;
}

/** A change as a headline and plain detail lines, shared by the app and the email. */
export function describeChange(change: DigestChange): { headline: string; lines: string[] } {
  const verb = { added: "added", changed: "changed", removed: "removed" }[change.op];
  const headline = `${change.title} was ${verb}`;
  if (change.op === "removed") return { headline, lines: [] };
  if (change.op === "added") return { headline, lines: change.startsAt ? [when(change.startsAt, change.tz)] : [] };
  const lines = change.fields.map((f) =>
    f.field === "details" ? "Booking details were updated" : `${LABELS[f.field]}: ${show(f.field, f.before, change.tz)} → ${show(f.field, f.after, change.tz)}`,
  );
  return { headline, lines };
}
