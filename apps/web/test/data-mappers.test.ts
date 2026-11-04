import { describe, expect, it } from "vitest";
import { assembleSnapshot, documentFromRow, itemFromRow, memberFromRow, tripFromRow, type ItemRow } from "../src/data/mappers";
import { itemInsertRow, itemUpdatePatch } from "../src/data/payloads";
import type { ItemFormValues } from "../src/components/ItemForm";

const row = (over: Partial<ItemRow> = {}): ItemRow => ({
  id: "i1",
  trip_id: "t1",
  owner_id: "u1",
  kind: "stay",
  visibility: "shared",
  group_item: true,
  starts_at: "2026-12-01T04:30:00+00:00",
  ends_at: null,
  tz: "Asia/Kolkata",
  title: "Beach hotel",
  location_url: null,
  details: null,
  version: 3,
  ...over,
});

describe("row mappers", () => {
  it("turns an item row into a core item with exact ISO times", () => {
    expect(itemFromRow(row({ ends_at: "2026-12-03T06:00:00+00:00", location_url: "https://x.example", details: { notes: "n" } }))).toEqual({
      id: "i1",
      tripId: "t1",
      ownerId: "u1",
      kind: "stay",
      visibility: "shared",
      groupItem: true,
      startsAt: "2026-12-01T04:30:00.000Z",
      endsAt: "2026-12-03T06:00:00.000Z",
      tz: "Asia/Kolkata",
      endTz: null,
      title: "Beach hotel",
      locationUrl: "https://x.example",
      details: { notes: "n" },
      version: 3,
    });
  });

  it("handles missing optional values", () => {
    const item = itemFromRow(row());
    expect(item.endsAt).toBeNull();
    expect(item.locationUrl).toBeNull();
    expect(item.details).toEqual({});
  });

  it("maps trips, members and documents", () => {
    expect(tripFromRow({ id: "t1", name: "Goa", start_date: "2026-12-01", end_date: null })).toEqual({
      id: "t1",
      name: "Goa",
      startDate: "2026-12-01",
      endDate: null,
    });
    expect(memberFromRow({ trip_id: "t1", user_id: "u1", role: "organizer", status: "approved", can_edit_all: false }, "Neha")).toEqual({
      userId: "u1",
      role: "organizer",
      status: "approved",
      canEditAll: false,
      displayName: "Neha",
    });
    expect(
      documentFromRow({ id: "d1", trip_id: "t1", item_id: null, owner_id: "u1", scope: "personal", storage_path: "t1/u1/0b1a2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d-passport.pdf", kind: "passport" }),
    ).toEqual({
      id: "d1",
      tripId: "t1",
      itemId: null,
      ownerId: "u1",
      scope: "personal",
      storagePath: "t1/u1/0b1a2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d-passport.pdf",
      kind: "passport",
      fileName: "passport.pdf",
    });
  });
});

describe("assembleSnapshot", () => {
  const base = {
    trip: { id: "t1", name: "Goa", start_date: null, end_date: null },
    members: [
      { trip_id: "t1", user_id: "u2", role: "member" as const, status: "approved" as const, can_edit_all: false },
      { trip_id: "t1", user_id: "u1", role: "organizer" as const, status: "approved" as const, can_edit_all: false },
      { trip_id: "t1", user_id: "u3", role: "member" as const, status: "pending" as const, can_edit_all: false },
    ],
    profiles: [
      { user_id: "u1", display_name: "Neha" },
      { user_id: "u2", display_name: "Aman" },
    ],
    items: [row({ id: "b", starts_at: "2026-12-02T00:00:00+00:00", title: "B" }), row({ id: "a", starts_at: "2026-12-01T00:00:00+00:00", title: "A" })],
    rsvps: [{ item_id: "a", user_id: "u2" }],
    documents: [],
  };

  it("puts the organizer first, then members by name, with a fallback name when there is no profile", () => {
    const snap = assembleSnapshot(base);
    expect(snap.members.map((m) => m.displayName)).toEqual(["Neha", "Aman", "Someone"]);
    expect(snap.members.map((m) => m.userId)).toEqual(["u1", "u2", "u3"]);
  });

  it("orders items by start time and maps RSVPs", () => {
    const snap = assembleSnapshot(base);
    expect(snap.items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(snap.rsvps).toEqual([{ itemId: "a", userId: "u2" }]);
    expect(snap.trip).toEqual({ id: "t1", name: "Goa", startDate: null, endDate: null });
  });
});

describe("item write payloads", () => {
  const values: ItemFormValues = {
    kind: "activity",
    title: "Museum",
    startsAt: "2026-12-01T04:30:00.000Z",
    endsAt: null,
    tz: "Asia/Kolkata",
    locationUrl: "https://maps.example/museum",
    visibility: "shared",
    groupItem: false,
    notes: "Bring tickets",
  };

  it("builds an insert row owned by the signed-in person", () => {
    expect(itemInsertRow("t1", "u1", values)).toEqual({
      trip_id: "t1",
      owner_id: "u1",
      kind: "activity",
      visibility: "shared",
      group_item: false,
      starts_at: "2026-12-01T04:30:00.000Z",
      ends_at: null,
      tz: "Asia/Kolkata",
      end_tz: null,
      title: "Museum",
      location_url: "https://maps.example/museum",
      details: { notes: "Bring tickets" },
    });
  });

  it("does not store an empty note", () => {
    expect(itemInsertRow("t1", "u1", { ...values, notes: "" }).details).toEqual({});
  });

  it("an update changes the form's fields, keeps other details, and never touches trip or owner", () => {
    const item = itemFromRow(row({ details: { flightNo: "6E 123", notes: "old" } }));
    const patch = itemUpdatePatch(item, values);
    expect(patch.details).toEqual({ flightNo: "6E 123", notes: "Bring tickets" });
    expect(patch).not.toHaveProperty("trip_id");
    expect(patch).not.toHaveProperty("owner_id");
    expect(patch).not.toHaveProperty("version");
    expect(patch.title).toBe("Museum");
  });

  it("removes the note when it is cleared", () => {
    const item = itemFromRow(row({ details: { flightNo: "6E 123", notes: "old" } }));
    expect(itemUpdatePatch(item, { ...values, notes: "" }).details).toEqual({ flightNo: "6E 123" });
  });
});

describe("item server time and chosen ids", () => {
  it("keeps when the server last changed an item", () => {
    expect(itemFromRow(row({ updated_at: "2026-12-01T10:00:00+00:00" })).updatedAt).toBe("2026-12-01T10:00:00.000Z");
    expect(itemFromRow(row())).not.toHaveProperty("updatedAt");
  });

  it("a plan made offline is inserted with the id it was given", () => {
    const values: ItemFormValues = { kind: "activity", title: "Dinner", startsAt: "2026-12-01T14:00:00.000Z", endsAt: null, tz: "Asia/Kolkata", locationUrl: null, visibility: "shared", groupItem: false, notes: "" };
    expect(itemInsertRow("t1", "u1", values, "chosen-id").id).toBe("chosen-id");
    expect(itemInsertRow("t1", "u1", values)).not.toHaveProperty("id");
  });
});

describe("arrival time zone", () => {
  it("is read from the row and written back", () => {
    expect(itemFromRow(row({ end_tz: "Europe/London" })).endTz).toBe("Europe/London");
    const values: ItemFormValues = { kind: "flight", title: "DEL to LHR", startsAt: "2026-12-01T17:30:00.000Z", endsAt: "2026-12-02T04:30:00.000Z", tz: "Asia/Kolkata", endTz: "Europe/London", locationUrl: null, visibility: "shared", groupItem: true, notes: "" };
    expect(itemInsertRow("t1", "u1", values).end_tz).toBe("Europe/London");
  });
});
