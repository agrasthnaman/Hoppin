import { describe, expect, it } from "vitest";
import {
  applyValues,
  coalesce,
  describeNotice,
  diffItem,
  overlayItem,
  reconcile,
  valuesOf,
  type UpdateEdit,
} from "../src/edits";
import type { Item } from "../src/types";

const item = (over: Partial<Item> = {}): Item => ({
  id: "i1",
  tripId: "t1",
  ownerId: "me",
  kind: "activity",
  visibility: "shared",
  groupItem: false,
  startsAt: "2026-12-01T04:30:00.000Z",
  endsAt: null,
  tz: "Asia/Kolkata",
  title: "Museum",
  locationUrl: null,
  details: { flightNo: "6E 1", notes: "old" },
  version: 3,
  updatedAt: "2026-12-01T10:00:00.000Z",
  ...over,
});
const T0 = Date.parse("2026-12-01T09:00:00.000Z"); // before the server's last change
const T1 = Date.parse("2026-12-01T11:00:00.000Z"); // after it

let n = 0;
const edit = (over: Partial<UpdateEdit> = {}): UpdateEdit => ({
  id: `e${(n += 1)}`,
  tripId: "t1",
  itemId: "i1",
  field: "title",
  value: "Museum (moved)",
  baseValue: "Museum",
  baseVersion: 3,
  at: T1,
  ...over,
});

describe("valuesOf, diffItem and applyValues", () => {
  it("reads an item as form values, with notes from the details", () => {
    expect(valuesOf(item())).toEqual({
      kind: "activity", title: "Museum", startsAt: "2026-12-01T04:30:00.000Z", endsAt: null, tz: "Asia/Kolkata",
      locationUrl: null, visibility: "shared", groupItem: false, notes: "old",
    });
  });

  it("lists only the fields that changed, with the value they had", () => {
    const next = { ...valuesOf(item()), title: "Museum (moved)", notes: "bring tickets" };
    expect(diffItem(item(), next)).toEqual([
      { field: "title", value: "Museum (moved)", baseValue: "Museum" },
      { field: "notes", value: "bring tickets", baseValue: "old" },
    ]);
    expect(diffItem(item(), valuesOf(item()))).toEqual([]);
  });

  it("applies values to an item, keeping other details and removing an emptied note", () => {
    const updated = applyValues(item(), { ...valuesOf(item()), title: "New", notes: "" });
    expect(updated.title).toBe("New");
    expect(updated.details).toEqual({ flightNo: "6E 1" });
    expect(updated.version).toBe(3);
  });
});

describe("overlayItem", () => {
  it("shows pending edits on top of the saved item, oldest first, without changing its version", () => {
    const shown = overlayItem(item(), [
      edit({ field: "title", value: "Second", at: 200 }),
      edit({ field: "title", value: "First", at: 100 }),
      edit({ field: "notes", value: "n", baseValue: "old", at: 150 }),
    ]);
    expect(shown.title).toBe("Second");
    expect(shown.details).toEqual({ flightNo: "6E 1", notes: "n" });
    expect(shown.version).toBe(3);
  });

  it("ignores edits for other items", () => {
    expect(overlayItem(item(), [edit({ itemId: "other", value: "x" })]).title).toBe("Museum");
  });
});

describe("coalesce", () => {
  it("a newer edit of the same field replaces the older one but keeps the original starting point", () => {
    const first = edit({ id: "a", value: "One", baseValue: "Museum", baseVersion: 3, at: 1 });
    const second = edit({ id: "b", value: "Two", baseValue: "One", baseVersion: 3, at: 2 });
    const queue = coalesce([first], second);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ value: "Two", baseValue: "Museum", baseVersion: 3, at: 2 });
  });

  it("keeps edits of different fields or items separate", () => {
    const queue = coalesce(coalesce([edit()], edit({ field: "notes", baseValue: "old", value: "n" })), edit({ itemId: "i2" }));
    expect(queue).toHaveLength(3);
  });

  it("drops an edit that puts the field back to where it started", () => {
    const first = edit({ value: "Changed", baseValue: "Museum" });
    const back = edit({ value: "Museum", baseValue: "Changed" });
    expect(coalesce([first], back)).toEqual([]);
  });
});

describe("reconcile", () => {
  it("applies everything when nobody else changed the item", () => {
    const e = edit({ baseVersion: 3 });
    expect(reconcile([e], [item()])).toEqual({ apply: [e], notices: [], drafts: [] });
  });

  it("applies edits to different fields than the ones someone else changed", () => {
    const e = edit({ baseVersion: 2 });
    const server = item({ version: 3, locationUrl: "https://maps.example/x" }); // they changed the location, not the title
    const result = reconcile([e], [server]);
    expect(result.apply).toEqual([e]);
    expect(result.notices).toEqual([]);
    expect(result.drafts).toEqual([]);
  });

  it("when the same field was changed and the other change is newer, theirs stays, and the edit becomes a draft with a notice", () => {
    const e = edit({ baseVersion: 2, baseValue: "Museum", value: "Mine", at: T0 });
    const result = reconcile([e], [item({ version: 3, title: "Theirs" })]);
    expect(result.apply).toEqual([]);
    expect(result.drafts).toEqual([e]);
    expect(result.notices).toHaveLength(1);
    expect(result.notices[0]).toMatchObject({ kind: "lost", field: "title", itemTitle: "Theirs", mine: "Mine", theirs: "Theirs" });
  });

  it("when the same field was changed and the edit is newer, the edit wins, with a notice", () => {
    const e = edit({ baseVersion: 2, baseValue: "Museum", value: "Mine", at: T1 });
    const result = reconcile([e], [item({ version: 3, title: "Theirs" })]);
    expect(result.apply).toEqual([e]);
    expect(result.drafts).toEqual([]);
    expect(result.notices[0]).toMatchObject({ kind: "overwrote", field: "title", mine: "Mine", theirs: "Theirs" });
  });

  it("treats someone else already making the same change as done", () => {
    const e = edit({ baseVersion: 2, baseValue: "Museum", value: "Theirs", at: T0 });
    const result = reconcile([e], [item({ version: 3, title: "Theirs" })]);
    expect(result.apply).toEqual([e]);
    expect(result.notices).toEqual([]);
  });

  it("when the item was deleted, keeps every edit as a draft and says so once", () => {
    const edits = [edit({ field: "title" }), edit({ field: "notes", baseValue: "old", value: "n" })];
    const result = reconcile(edits, []);
    expect(result.apply).toEqual([]);
    expect(result.drafts).toEqual(edits);
    expect(result.notices).toHaveLength(1);
    expect(result.notices[0]).toMatchObject({ kind: "deleted", itemId: "i1" });
  });

  it("without a server time to compare, keeps the server's value and saves the edit as a draft", () => {
    const e = edit({ baseVersion: 2, baseValue: "Museum", value: "Mine", at: T1 });
    const result = reconcile([e], [item({ version: 3, title: "Theirs", updatedAt: undefined })]);
    expect(result.drafts).toEqual([e]);
  });

  it("never loses an edit: each one is either applied or kept as a draft", () => {
    const edits = [
      edit({ itemId: "i1", field: "title", baseVersion: 2, baseValue: "Museum", value: "A", at: T0 }),
      edit({ itemId: "i1", field: "notes", baseVersion: 2, baseValue: "old", value: "B", at: T1 }),
      edit({ itemId: "gone", field: "title", baseValue: "x", value: "C" }),
      edit({ itemId: "i2", field: "title", baseVersion: 1, baseValue: "Lunch", value: "D", at: T1 }),
    ];
    const servers = [item({ version: 3, title: "Theirs" }), item({ id: "i2", version: 2, title: "Dinner" })];
    const result = reconcile(edits, servers);
    expect(result.apply.length + result.drafts.length).toBe(edits.length);
    expect(new Set([...result.apply, ...result.drafts].map((e) => e.id)).size).toBe(edits.length);
  });
});

describe("describeNotice", () => {
  it("explains each outcome in plain words", () => {
    const base = { id: "n", tripId: "t1", itemId: "i1", itemTitle: "Museum", field: "startsAt" as const, mine: "a", theirs: "b", at: 1 };
    expect(describeNotice({ ...base, kind: "deleted" })).toBe('"Museum" was deleted while you were offline. Your changes are saved as a draft.');
    expect(describeNotice({ ...base, kind: "rejected" })).toBe('"Museum" couldn\'t be saved: the server refused it. Your changes are saved as a draft.');
    expect(describeNotice({ ...base, kind: "overwrote" })).toBe('Your change to the start time of "Museum" replaced someone else\'s change.');
    expect(describeNotice({ ...base, kind: "lost" })).toBe(
      'Someone else changed the start time of "Museum" after you, so your change wasn\'t applied. It\'s saved as a draft.',
    );
  });
});
