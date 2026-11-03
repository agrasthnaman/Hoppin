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
