import {
  fileNameFromPath,
  type DocumentScope,
  type Item,
  type ItemKind,
  type MemberInfo,
  type MembershipStatus,
  type TripDocument,
  type TripSnapshot,
  type Visibility,
} from "@hoppin/core";

/** Database rows as the Supabase client returns them (snake_case). */
export interface TripRow {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
}
export interface MemberRow {
  trip_id: string;
  user_id: string;
  role: "organizer" | "member";
  status: MembershipStatus;
  can_edit_all: boolean;
}
export interface ProfileRow {
  user_id: string;
  display_name: string;
}
export interface ItemRow {
  id: string;
  trip_id: string;
  owner_id: string;
  kind: ItemKind;
  visibility: Visibility;
  group_item: boolean;
  starts_at: string;
  ends_at: string | null;
  tz: string;
  end_tz?: string | null;
  title: string;
  location_url: string | null;
  details: Record<string, unknown> | null;
  version: number;
  updated_at?: string;
}
export interface RsvpRow {
  item_id: string;
  user_id: string;
}
export interface DocumentRow {
  id: string;
  trip_id: string;
  item_id: string | null;
  owner_id: string;
  scope: DocumentScope;
  storage_path: string;
  kind: string;
}

/** Postgres sends `+00:00`; the app uses one exact form (`...Z`). */
const iso = (value: string) => new Date(value).toISOString();

export function tripFromRow(row: TripRow): TripSnapshot["trip"] {
  return { id: row.id, name: row.name, startDate: row.start_date, endDate: row.end_date };
}

export function memberFromRow(row: MemberRow, displayName: string): MemberInfo {
  return { userId: row.user_id, role: row.role, status: row.status, canEditAll: row.can_edit_all, displayName };
}

export function itemFromRow(row: ItemRow): Item {
  return {
    id: row.id,
    tripId: row.trip_id,
    ownerId: row.owner_id,
    kind: row.kind,
    visibility: row.visibility,
    groupItem: row.group_item,
    startsAt: iso(row.starts_at),
    endsAt: row.ends_at ? iso(row.ends_at) : null,
    tz: row.tz,
    endTz: row.end_tz ?? null,
    title: row.title,
    locationUrl: row.location_url,
    details: row.details ?? {},
    version: row.version,
    ...(row.updated_at ? { updatedAt: iso(row.updated_at) } : {}),
  };
}

export function documentFromRow(row: DocumentRow): TripDocument {
  return {
    id: row.id,
    tripId: row.trip_id,
    itemId: row.item_id,
    ownerId: row.owner_id,
    scope: row.scope,
    storagePath: row.storage_path,
    kind: row.kind,
    fileName: fileNameFromPath(row.storage_path),
  };
}

export interface SnapshotRows {
  trip: TripRow;
  members: MemberRow[];
  profiles: ProfileRow[];
  items: ItemRow[];
  rsvps: RsvpRow[];
  documents: DocumentRow[];
}

/** Builds the app's copy of a trip from the rows of one load. Organizer first, then members by name. */
export function assembleSnapshot(rows: SnapshotRows): TripSnapshot {
  const names = new Map(rows.profiles.map((p) => [p.user_id, p.display_name]));
  const members = rows.members
    .map((m) => memberFromRow(m, names.get(m.user_id) ?? "Someone"))
    .sort((a, b) => Number(b.role === "organizer") - Number(a.role === "organizer") || a.displayName.localeCompare(b.displayName));
  const items = rows.items.map(itemFromRow).sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.title.localeCompare(b.title));
  return {
    trip: tripFromRow(rows.trip),
    members,
    items,
    rsvps: rows.rsvps.map((r) => ({ itemId: r.item_id, userId: r.user_id })),
    documents: rows.documents.map(documentFromRow),
  };
}
