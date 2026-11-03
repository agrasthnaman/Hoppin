import type { Item, MemberRef, TripDocument } from "./types";

/**
 * Whether the member may edit or delete an item. Mirrors the database rule (which is what actually
 * enforces it): the creator, the organizer, or a member the organizer granted edit rights to. Nobody
 * but the owner can touch a private item.
 */
export function canEdit(item: Pick<Item, "ownerId" | "visibility">, member: MemberRef): boolean {
  if (member.status !== "approved") return false;
  if (item.ownerId === member.userId) return true;
  return item.visibility === "shared" && (member.role === "organizer" || member.canEditAll);
}

/** Shared documents are visible to every approved member; personal ones only to their owner and the organizer. */
export function canSeeDocument(doc: Pick<TripDocument, "scope" | "ownerId">, member: MemberRef): boolean {
  if (member.status !== "approved") return false;
  return doc.scope === "shared" || doc.ownerId === member.userId || member.role === "organizer";
}

export function visibleDocuments(docs: TripDocument[], member: MemberRef): TripDocument[] {
  return docs.filter((doc) => canSeeDocument(doc, member));
}
