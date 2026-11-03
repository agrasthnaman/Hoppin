import { describe, expect, it } from "vitest";
import { ConflictError, createItem, setRsvp, updateItem } from "../src/data/writes";
import type { Item } from "@hoppin/core";
import type { ItemFormValues } from "../src/components/ItemForm";

const values: ItemFormValues = {
  kind: "activity", title: "Museum", startsAt: "2026-12-01T04:30:00.000Z", endsAt: null, tz: "Asia/Kolkata",
  locationUrl: null, visibility: "shared", groupItem: false, notes: "",
};
const dbRow = {
  id: "i1", trip_id: "t1", owner_id: "u1", kind: "activity", visibility: "shared", group_item: false,
  starts_at: "2026-12-01T04:30:00+00:00", ends_at: null, tz: "Asia/Kolkata", title: "Museum", location_url: null, details: {}, version: 2,
};
const item: Item = {
  id: "i1", tripId: "t1", ownerId: "u1", kind: "activity", visibility: "shared", groupItem: false, startsAt: "2026-12-01T04:30:00.000Z",
  endsAt: null, tz: "Asia/Kolkata", title: "Old title", locationUrl: null, details: {}, version: 1,
};

/** Records every call and returns canned results. */
function recorder(result: { data: unknown; error: { message: string } | null }) {
  const log: unknown[][] = [];
  const chain: any = new Proxy(() => {}, {
    get(_t, prop: string) {
      if (prop === "then") return (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
      return (...args: unknown[]) => {
        log.push([prop, ...args]);
        return chain;
      };
    },
  });
  return { client: { from: (table: string) => (log.push(["from", table]), chain) } as any, log };
}

describe("createItem", () => {
  it("inserts the row and returns the saved item", async () => {
    const { client, log } = recorder({ data: dbRow, error: null });
    const saved = await createItem(client, "t1", "u1", values);
    expect(log[0]).toEqual(["from", "items"]);
    expect(log[1]?.[0]).toBe("insert");
    expect((log[1]?.[1] as any).owner_id).toBe("u1");
    expect(saved.id).toBe("i1");
  });

  it("throws the database message on failure", async () => {
    const { client } = recorder({ data: null, error: { message: "new row violates row-level security policy" } });
    await expect(createItem(client, "t1", "u1", values)).rejects.toThrow(/row-level security/);
  });
});

describe("updateItem", () => {
  it("only updates if the item still has the version the person saw", async () => {
    const { client, log } = recorder({ data: [dbRow], error: null });
    const saved = await updateItem(client, item, values);
    expect(log).toContainEqual(["eq", "id", "i1"]);
    expect(log).toContainEqual(["eq", "version", 1]);
    expect(saved.version).toBe(2);
  });

  it("reports a conflict when someone else changed it first (no row matched)", async () => {
    const { client } = recorder({ data: [], error: null });
    await expect(updateItem(client, item, values)).rejects.toBeInstanceOf(ConflictError);
  });

  it("throws the database message on other failures", async () => {
    const { client } = recorder({ data: null, error: { message: "boom" } });
    await expect(updateItem(client, item, values)).rejects.toThrow("boom");
  });
});

describe("setRsvp", () => {
  it("adds an RSVP when going", async () => {
    const { client, log } = recorder({ data: null, error: null });
    await setRsvp(client, "i1", "u1", true);
    expect(log).toContainEqual(["insert", { item_id: "i1", user_id: "u1" }]);
  });

  it("removes it when not going", async () => {
    const { client, log } = recorder({ data: null, error: null });
    await setRsvp(client, "i1", "u1", false);
    expect(log.map((l) => l[0])).toContain("delete");
    expect(log).toContainEqual(["eq", "item_id", "i1"]);
    expect(log).toContainEqual(["eq", "user_id", "u1"]);
  });

  it("treats an RSVP that already exists as success", async () => {
    const { client } = recorder({ data: null, error: { message: 'duplicate key value violates unique constraint "rsvps_pkey"' } });
    await expect(setRsvp(client, "i1", "u1", true)).resolves.toBeUndefined();
  });
});
