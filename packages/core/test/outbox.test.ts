import { describe, expect, it } from "vitest";
import { itemFromValues, overlaySnapshot, type OutboxRecord } from "../src/outbox";
import type { Item, ItemValues, TripSnapshot } from "../src/types";

const item = (over: Partial<Item> = {}): Item => ({
  id: "i1", tripId: "t1", ownerId: "riya", kind: "activity", visibility: "shared", groupItem: false,
  startsAt: "2026-12-01T04:30:00.000Z", endsAt: null, tz: "Asia/Kolkata", title: "Museum", locationUrl: null,
  details: {}, version: 2, ...over,
});
const snapshot = (): TripSnapshot => ({
  trip: { id: "t1", name: "Goa", startDate: null, endDate: null },
  members: [],
  items: [item(), item({ id: "i2", title: "Lunch", startsAt: "2026-12-01T08:00:00.000Z" })],
  rsvps: [{ itemId: "i1", userId: "riya" }],
  documents: [],
});
const values: ItemValues = {
  kind: "activity", title: "Beach dinner", startsAt: "2026-12-01T14:00:00.000Z", endsAt: null, tz: "Asia/Kolkata",
  locationUrl: null, visibility: "shared", groupItem: false, notes: "Bring cash",
};

describe("itemFromValues", () => {
  it("builds a not-yet-saved item owned by the creator, with version 0", () => {
    expect(itemFromValues("new1", "t1", "me", values)).toMatchObject({
      id: "new1", tripId: "t1", ownerId: "me", title: "Beach dinner", version: 0, details: { notes: "Bring cash" },
    });
  });
});

describe("overlaySnapshot", () => {
  it("shows waiting edits on saved items", () => {
    const outbox: OutboxRecord[] = [
      { kind: "update", id: "e1", tripId: "t1", itemId: "i1", field: "title", value: "Museum (moved)", baseValue: "Museum", baseVersion: 2, at: 1 },
    ];
    const shown = overlaySnapshot(snapshot(), outbox);
    expect(shown.items.find((i) => i.id === "i1")?.title).toBe("Museum (moved)");
    expect(shown.items.find((i) => i.id === "i2")?.title).toBe("Lunch");
  });

  it("adds plans created on this device, in time order, with their notes", () => {
    const outbox: OutboxRecord[] = [{ kind: "create", id: "c1", tripId: "t1", itemId: "new1", ownerId: "me", values, at: 5 }];
    const shown = overlaySnapshot(snapshot(), outbox);
    expect(shown.items.map((i) => i.id)).toEqual(["i1", "i2", "new1"]);
    expect(shown.items[2]?.details).toEqual({ notes: "Bring cash" });
  });

  it("adds and removes this person's RSVPs without duplicating", () => {
    const outbox: OutboxRecord[] = [
      { kind: "rsvp", id: "r1", tripId: "t1", itemId: "i2", userId: "me", going: true, at: 1 },
      { kind: "rsvp", id: "r2", tripId: "t1", itemId: "i1", userId: "riya", going: false, at: 2 },
      { kind: "rsvp", id: "r3", tripId: "t1", itemId: "i2", userId: "me", going: true, at: 3 },
    ];
    const shown = overlaySnapshot(snapshot(), outbox);
    expect(shown.rsvps).toEqual([{ itemId: "i2", userId: "me" }]);
  });

  it("ignores records for other trips and leaves the saved copy untouched", () => {
    const base = snapshot();
    const outbox: OutboxRecord[] = [{ kind: "update", id: "e1", tripId: "other", itemId: "i1", field: "title", value: "X", baseValue: "Museum", baseVersion: 2, at: 1 }];
    expect(overlaySnapshot(base, outbox).items[0]?.title).toBe("Museum");
    overlaySnapshot(base, [{ kind: "update", id: "e2", tripId: "t1", itemId: "i1", field: "title", value: "Y", baseValue: "Museum", baseVersion: 2, at: 1 }]);
    expect(base.items[0]?.title).toBe("Museum");
  });
});
