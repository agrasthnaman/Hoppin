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
