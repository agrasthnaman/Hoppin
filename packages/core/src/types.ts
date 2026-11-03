export type ItemKind = "flight" | "stay" | "activity" | "transport" | "plan";
export type Visibility = "private" | "shared";

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
  trip: { id: string; name: string; startDate: string | null; endDate: string | null };
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
  locationUrl: string | null;
  visibility: Visibility;
  groupItem: boolean;
  notes: string;
}
