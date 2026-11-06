import { describe, expect, it } from "vitest";
import { buildDigest, describeChange, takeWindow, type ChangeLogEntry } from "../src/digest";

const MIN = 60_000;
const WINDOW = 5 * MIN;
const T0 = Date.parse("2026-12-01T08:00:00Z");

const hotel = { id: "stay", trip_id: "goa", owner_id: "org", kind: "stay", visibility: "shared", title: "Beach hotel", starts_at: "2026-12-01T08:30:00Z", ends_at: null, tz: "Asia/Kolkata", location_url: null, details: {} };

let seq = 0;
function entry(over: Partial<ChangeLogEntry> & Pick<ChangeLogEntry, "op">): ChangeLogEntry {
  seq += 1;
  return {
    id: seq,
    tripId: "goa",
    itemId: "stay",
    actorId: "org",
    changedAt: new Date(T0 + seq * 1000).toISOString(),
    before: over.op === "insert" ? null : hotel,
    after: over.op === "delete" ? null : hotel,
    itemVisibility: "shared",
    itemOwnerId: "org",
    ...over,
  };
}
const at = (ms: number) => new Date(T0 + ms).toISOString();

describe("buildDigest", () => {
  it("changes inside one window collapse into one digest", () => {
    const changes = [
      entry({ op: "update", changedAt: at(0), after: { ...hotel, title: "Beach hotel (2 rooms)" } }),
      entry({ op: "update", changedAt: at(2 * MIN), before: { ...hotel, title: "Beach hotel (2 rooms)" }, after: { ...hotel, title: "Sea view hotel", starts_at: "2026-12-01T09:30:00Z" } }),
      entry({ op: "insert", itemId: "dinner", changedAt: at(3 * MIN), after: { ...hotel, id: "dinner", kind: "plan", title: "Dinner" } }),
    ];
    const digest = buildDigest(changes, "alice", WINDOW);
    expect(digest).not.toBeNull();
    expect(digest!.tripId).toBe("goa");
    expect(digest!.windowStart).toBe(at(0));
    expect(digest!.windowEnd).toBe(at(WINDOW));
    expect(digest!.changes.map((c) => [c.itemId, c.op])).toEqual([["stay", "changed"], ["dinner", "added"]]);
    expect(digest!.changes[0]!.fields.find((f) => f.field === "title")).toEqual({ field: "title", before: "Beach hotel", after: "Sea view hotel" });
  });

  it("leaves changes after the window for the next digest", () => {
    const changes = [entry({ op: "update", changedAt: at(0), after: { ...hotel, title: "A" } }), entry({ op: "insert", itemId: "late", changedAt: at(WINDOW) })];
    expect(buildDigest(changes, "alice", WINDOW)!.changes.map((c) => c.itemId)).toEqual(["stay"]);
  });

  it("a private item's changes never reach other members", () => {
    const secret = { ...hotel, id: "abc", owner_id: "alice", visibility: "private", title: "ABC place" };
    const changes = [
      entry({ op: "insert", itemId: "abc", actorId: "alice", itemOwnerId: "alice", itemVisibility: "private", after: secret }),
      // made private: logged as private, so nobody else learns its new state
      entry({ op: "update", itemId: "stay", itemVisibility: "private", after: { ...hotel, visibility: "private", title: "Hidden" } }),
    ];
    expect(buildDigest(changes, "bob", WINDOW)).toBeNull();
    expect(buildDigest(changes, "org", WINDOW)).toBeNull(); // the organizer made both changes visible to them only through their own edit
  });

  it("the owner of a private item hears when someone else changes it", () => {
    const secret = { ...hotel, owner_id: "alice", visibility: "private" };
    const change = entry({ op: "update", actorId: "editor", itemOwnerId: "alice", itemVisibility: "private", before: secret, after: { ...secret, title: "Moved" } });
    expect(buildDigest([change], "alice", WINDOW)!.changes).toHaveLength(1);
  });

  it("the actor does not get their own change", () => {
    const changes = [entry({ op: "update", actorId: "alice", after: { ...hotel, title: "Mine" } })];
    expect(buildDigest(changes, "alice", WINDOW)).toBeNull();
    expect(buildDigest(changes, "bob", WINDOW)!.changes[0]!.by).toEqual(["alice"]);
  });

  it("the digest lists what changed (before and after)", () => {
    const changes = [
      entry({ op: "update", before: hotel, after: { ...hotel, starts_at: "2026-12-01T09:30:00Z", location_url: "https://maps.example/x", details: { ref: "AB12" }, version: 2, updated_at: "later" } }),
    ];
    const [change] = buildDigest(changes, "alice", WINDOW)!.changes;
    expect(change!.fields).toEqual([
      { field: "time", before: "2026-12-01T08:30:00Z", after: "2026-12-01T09:30:00Z" },
      { field: "place", before: null, after: "https://maps.example/x" },
      { field: "details", before: null, after: null }, // booking details may hold references: say they changed, never what to
    ]);
  });

  it("an edit that ends where it started, or an item added then removed, says nothing", () => {
    const there = entry({ op: "update", after: { ...hotel, title: "Other" } });
    const back = entry({ op: "update", before: { ...hotel, title: "Other" }, after: hotel });
    const added = entry({ op: "insert", itemId: "tmp" });
    const gone = entry({ op: "delete", itemId: "tmp" });
    expect(buildDigest([there, back, added, gone], "alice", WINDOW)).toBeNull();
  });

  it("a removal keeps the last known title", () => {
    const [change] = buildDigest([entry({ op: "delete" })], "alice", WINDOW)!.changes;
    expect(change).toMatchObject({ op: "removed", title: "Beach hotel", fields: [] });
  });

  it("is empty for no entries", () => {
    expect(buildDigest([], "alice", WINDOW)).toBeNull();
  });
});

describe("takeWindow", () => {
  it("takes the leading entries that fall inside the window from the first one", () => {
    const a = entry({ op: "insert", changedAt: at(0) });
    const b = entry({ op: "insert", changedAt: at(WINDOW - 1) });
    const c = entry({ op: "insert", changedAt: at(WINDOW) });
    const d = entry({ op: "insert", changedAt: at(1) }); // logged late; waits for the next window rather than skipping c
    expect(takeWindow([a, b, c, d], WINDOW).map((e) => e.id)).toEqual([a.id, b.id]);
    expect(takeWindow([], WINDOW)).toEqual([]);
  });
});

describe("describeChange", () => {
  it("writes a plain sentence in the item's time zone", () => {
    const digest = buildDigest(
      [entry({ op: "update", after: { ...hotel, title: "Sea view hotel", starts_at: "2026-12-01T09:30:00Z" } }), entry({ op: "insert", itemId: "d", after: { ...hotel, id: "d", title: "Dinner" } }), entry({ op: "delete", itemId: "x", before: { ...hotel, title: "Kayak" } })],
      "alice",
      WINDOW,
    )!;
    expect(digest.changes.map(describeChange)).toEqual([
      { headline: "Sea view hotel was changed", lines: ["Name: Beach hotel → Sea view hotel", "Time: Tue 1 Dec, 14:00 → Tue 1 Dec, 15:00"] },
      { headline: "Dinner was added", lines: ["Tue 1 Dec, 14:00"] },
      { headline: "Kayak was removed", lines: [] },
    ]);
  });
});
