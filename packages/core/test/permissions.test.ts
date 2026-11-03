import { describe, expect, it } from "vitest";
import { canEdit, canSeeDocument, visibleDocuments } from "../src/permissions";
import type { MemberRef, TripDocument } from "../src/types";

const member = (over: Partial<MemberRef> = {}): MemberRef => ({
  userId: "me",
  role: "member",
  status: "approved",
  canEditAll: false,
  ...over,
});
const item = (over: Partial<{ ownerId: string; visibility: "private" | "shared" }> = {}) => ({
  ownerId: "riya",
  visibility: "shared" as const,
  ...over,
});
const doc = (over: Partial<TripDocument> = {}): TripDocument => ({
  id: "d1",
  tripId: "t1",
  itemId: null,
  ownerId: "riya",
  scope: "shared",
  storagePath: "t1/riya/d1-ticket.pdf",
  kind: "ticket",
  fileName: "ticket.pdf",
  ...over,
});

describe("canEdit", () => {
  it("lets the creator edit their own item", () => {
    expect(canEdit(item({ ownerId: "me" }), member())).toBe(true);
  });

  it("does not let another member edit it", () => {
    expect(canEdit(item(), member())).toBe(false);
  });

  it("lets the organizer edit any shared item", () => {
    expect(canEdit(item(), member({ role: "organizer" }))).toBe(true);
  });

  it("lets a member with edit rights granted by the organizer edit others' shared items", () => {
    expect(canEdit(item(), member({ canEditAll: true }))).toBe(true);
  });

  it("never lets anyone but the owner touch a private item, not even the organizer", () => {
    const secret = item({ visibility: "private" });
    expect(canEdit(secret, member({ role: "organizer" }))).toBe(false);
    expect(canEdit(secret, member({ canEditAll: true }))).toBe(false);
    expect(canEdit({ ...secret, ownerId: "me" }, member())).toBe(true);
  });

  it("gives nothing to pending or removed members", () => {
    for (const status of ["pending", "removed"] as const) {
      expect(canEdit(item({ ownerId: "me" }), member({ status })), status).toBe(false);
      expect(canEdit(item(), member({ status, role: "organizer", canEditAll: true })), status).toBe(false);
    }
  });
});

describe("documents visibility", () => {
  it("shared documents are visible to every approved member", () => {
    expect(canSeeDocument(doc(), member())).toBe(true);
  });

  it("a personal document is visible to its owner and the organizer only", () => {
    const passport = doc({ scope: "personal" });
    expect(canSeeDocument(passport, member())).toBe(false);
    expect(canSeeDocument(passport, member({ canEditAll: true }))).toBe(false);
    expect(canSeeDocument(passport, member({ userId: "riya" }))).toBe(true);
    expect(canSeeDocument(passport, member({ role: "organizer" }))).toBe(true);
  });

  it("nothing is visible to pending or removed members", () => {
    expect(canSeeDocument(doc(), member({ status: "pending" }))).toBe(false);
    expect(canSeeDocument(doc({ ownerId: "me" }), member({ status: "removed" }))).toBe(false);
  });

  it("visibleDocuments lists only what the member may see", () => {
    const docs = [doc({ id: "a" }), doc({ id: "b", scope: "personal" }), doc({ id: "c", scope: "personal", ownerId: "me" })];
    expect(visibleDocuments(docs, member()).map((d) => d.id)).toEqual(["a", "c"]);
  });
});
