import {
  fileNameFromPath,
  type ExpenseChange,
  type ExpenseRecord,
  type ExpenseShare,
  type TripGuest,
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
  base_currency?: string | null;
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
  return {
    id: row.id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    ...(row.base_currency !== undefined ? { baseCurrency: row.base_currency } : {}),
  };
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

export interface GuestRow {
  id: string;
  trip_id: string;
  name: string;
  added_by: string;
}
export interface ExpenseRow {
  id: string;
  trip_id: string;
  kind: ExpenseRecord["kind"];
  title: string;
  category: ExpenseRecord["category"];
  paid_by_user: string | null;
  paid_by_guest: string | null;
  /** Postgres bigint and numeric can arrive as text. */
  amount: number | string;
  currency: string;
  rate: number | string;
  rate_date: string;
  base_currency: string;
  spent_on: string;
  created_by: string;
  version?: number;
  created_at?: string;
  updated_at?: string;
}
export interface ExpenseShareRow {
  expense_id: string;
  position: number;
  user_id: string | null;
  guest_id: string | null;
  share: number | string | null;
}
/** An expense as stored in the history: the row plus its split. */
type LoggedExpense = ExpenseRow & { shares?: Omit<ExpenseShareRow, "expense_id" | "position">[] };
export interface ExpenseLogRow {
  expense_id: string;
  actor_id: string | null;
  op: ExpenseChange["op"];
  changed_at: string;
  before: LoggedExpense | null;
  after: LoggedExpense | null;
}

export function guestFromRow(row: GuestRow): TripGuest {
  return { id: row.id, tripId: row.trip_id, name: row.name, addedBy: row.added_by };
}

function shareFromRow(row: Omit<ExpenseShareRow, "expense_id" | "position">): ExpenseShare {
  const who = (row.user_id ?? row.guest_id) as string;
  return row.share === null || row.share === undefined ? { who } : { who, share: Number(row.share) };
}

/** An expense row and its split rows (in any order) as one expense. */
export function expenseFromRows(row: ExpenseRow, shares: Omit<ExpenseShareRow, "expense_id">[]): ExpenseRecord {
  return {
    id: row.id,
    tripId: row.trip_id,
    kind: row.kind,
    title: row.title,
    category: row.category,
    paidBy: (row.paid_by_user ?? row.paid_by_guest) as string,
    amount: Number(row.amount),
    currency: row.currency,
    rate: Number(row.rate),
    rateDate: row.rate_date,
    baseCurrency: row.base_currency,
    spentOn: row.spent_on,
    split: [...shares].sort((a, b) => a.position - b.position).map(shareFromRow),
    createdBy: row.created_by,
    version: row.version ?? 1,
    ...(row.created_at ? { createdAt: iso(row.created_at) } : {}),
    ...(row.updated_at ? { updatedAt: iso(row.updated_at) } : {}),
  };
}

export function expenseChangeFromRow(row: ExpenseLogRow): ExpenseChange {
  const logged = (e: LoggedExpense | null) => (e ? expenseFromRows(e, (e.shares ?? []).map((s, position) => ({ ...s, position }))) : null);
  return { expenseId: row.expense_id, actorId: row.actor_id, op: row.op, at: iso(row.changed_at), before: logged(row.before), after: logged(row.after) };
}

export interface SnapshotRows {
  trip: TripRow;
  members: MemberRow[];
  profiles: ProfileRow[];
  items: ItemRow[];
  rsvps: RsvpRow[];
  documents: DocumentRow[];
  guests?: GuestRow[];
  expenses?: ExpenseRow[];
  shares?: ExpenseShareRow[];
  expenseLog?: ExpenseLogRow[];
}

/** Builds the app's copy of a trip from the rows of one load. Organizer first, then members by name. */
export function assembleSnapshot(rows: SnapshotRows): TripSnapshot {
  const names = new Map(rows.profiles.map((p) => [p.user_id, p.display_name]));
  const members = rows.members
    .map((m) => memberFromRow(m, names.get(m.user_id) ?? "Someone"))
    .sort((a, b) => Number(b.role === "organizer") - Number(a.role === "organizer") || a.displayName.localeCompare(b.displayName));
  const items = rows.items.map(itemFromRow).sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.title.localeCompare(b.title));
  const snapshot: TripSnapshot = {
    trip: tripFromRow(rows.trip),
    members,
    items,
    rsvps: rows.rsvps.map((r) => ({ itemId: r.item_id, userId: r.user_id })),
    documents: rows.documents.map(documentFromRow),
  };
  if (!rows.expenses) return snapshot;
  const sharesBy = new Map<string, ExpenseShareRow[]>();
  for (const s of rows.shares ?? []) sharesBy.set(s.expense_id, [...(sharesBy.get(s.expense_id) ?? []), s]);
  return {
    ...snapshot,
    guests: (rows.guests ?? []).map(guestFromRow).sort((a, b) => a.name.localeCompare(b.name)),
    expenses: rows.expenses
      .map((e) => expenseFromRows(e, sharesBy.get(e.id) ?? []))
      .sort((a, b) => b.spentOn.localeCompare(a.spentOn) || (b.createdAt ?? "").localeCompare(a.createdAt ?? "")),
    expenseHistory: (rows.expenseLog ?? []).map(expenseChangeFromRow).sort((a, b) => a.at.localeCompare(b.at)),
  };
}
