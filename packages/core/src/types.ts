export type ItemKind = "flight" | "stay" | "activity" | "transport" | "plan";
export type Visibility = "private" | "shared";

/** Where a trip goes, with the coordinates looked up once for it (used for the weather). */
export interface TripDestination {
  name: string;
  lat: number;
  lon: number;
}

/** A trip item (mirrors the `items` table). Times are ISO instants; `tz` is the IANA zone local to the item's location. */
export interface Item {
  id: string;
  tripId: string;
  ownerId: string;
  kind: ItemKind;
  visibility: Visibility;
  /** Fixed plan for the whole group (flight, hotel, group activity). Group items are always shared. */
  groupItem: boolean;
  startsAt: string;
  endsAt: string | null;
  tz: string;
  /** Zone the end time is local to, when it differs from `tz` (a flight that lands in another zone). Missing or null means `tz`. */
  endTz?: string | null;
  title: string;
  locationUrl: string | null;
  details: Record<string, unknown>;
  version: number;
  /** When the server last changed it (ISO). Present on items loaded from the server. */
  updatedAt?: string;
}

export type MembershipStatus = "pending" | "approved" | "removed";
export type DocumentScope = "shared" | "personal";

/** The signed-in person's membership in a trip (mirrors a `members` row). */
export interface MemberRef {
  userId: string;
  role: "organizer" | "member";
  status: MembershipStatus;
  /** The organizer let this member edit other people's items. */
  canEditAll: boolean;
}

/** A document attached to a trip, and optionally to one item (mirrors the `documents` table). */
export interface TripDocument {
  id: string;
  tripId: string;
  itemId: string | null;
  ownerId: string;
  scope: DocumentScope;
  storagePath: string;
  kind: string;
  fileName: string;
}

/** A member as shown in the app: their rights plus the name from their profile. */
export interface MemberInfo extends MemberRef {
  displayName: string;
}

/** Everything the app keeps on the device for one trip, so it works with no signal. */
export interface TripSnapshot {
  trip: { id: string; name: string; startDate: string | null; endDate: string | null; destination?: TripDestination | null };
  members: MemberInfo[];
  items: Item[];
  rsvps: { itemId: string; userId: string }[];
  documents: TripDocument[];
}

export type SnapshotResult = { status: "ok"; snapshot: TripSnapshot } | { status: "no-access" };

/** Where fresh trip data comes from (the Supabase data layer). `no-access` means the person was removed or the trip is gone. */
export interface TripSource {
  fetchSnapshot(tripId: string): Promise<SnapshotResult>;
}

/** Where document bytes come from. */
export interface DocumentSource {
  download(doc: TripDocument): Promise<{ data: ArrayBuffer; contentType: string }>;
}

/** The editable fields of an item, as one set of values (what the add and edit form works with). */
export interface ItemValues {
  kind: ItemKind;
  title: string;
  startsAt: string;
  endsAt: string | null;
  tz: string;
  /** Zone the end time is entered in, when it differs from `tz`. */
  endTz?: string | null;
  locationUrl: string | null;
  visibility: Visibility;
  groupItem: boolean;
  notes: string;
}

/** One person's part of an expense. `who` is a member's user id or a named guest's id. */
export interface ExpenseShare {
  who: string;
  /** Custom split: this person's part as a whole number (an amount in minor units, or any weight). Leave it out on everyone for an equal split. */
  share?: number;
}

/** Money someone paid for the group. Kept in the currency it was paid in, with the exchange rate captured when it was entered. */
export interface Expense {
  paidBy: string;
  /** In minor units of `currency` (paise, cents), never fractions. */
  amount: number;
  currency: string;
  /** What one unit of `currency` was worth in the trip's base currency when the expense was entered. */
  rate: number;
  split: ExpenseShare[];
}
