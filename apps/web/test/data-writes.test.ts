import { describe, expect, it } from "vitest";
import { addGuest, ConflictError, createItem, deleteExpense, saveExpense, setRsvp, updateItem } from "../src/data/writes";
import { expensePayload } from "../src/data/payloads";
import type { ExpenseRecord, Item } from "@hoppin/core";
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

describe("money writes", () => {
  const expense: ExpenseRecord = {
    id: "e1", tripId: "t1", kind: "expense", title: "Dinner", category: "food", paidBy: "mia", amount: 90000, currency: "INR", rate: 1,
    rateDate: "2026-12-01", baseCurrency: "INR", spentOn: "2026-12-01", split: [{ who: "mia", share: 60000 }, { who: "u1", share: 30000 }], createdBy: "u1", version: 0,
  };

  it("sends an expense and its split in one call, telling guests apart from members", async () => {
    const calls: unknown[][] = [];
    const client = { from: () => null, rpc: async (...args: unknown[]) => (calls.push(args), { error: null }) };
    await saveExpense(client, expense, new Set(["mia"]));
    expect(calls).toEqual([
      [
        "save_expense",
        {
          p: {
            id: "e1", trip_id: "t1", kind: "expense", title: "Dinner", category: "food", paid_by_user: null, paid_by_guest: "mia", amount: 90000,
            currency: "INR", rate: 1, rate_date: "2026-12-01", base_currency: "INR", spent_on: "2026-12-01",
            shares: [{ guest_id: "mia", share: 60000 }, { user_id: "u1", share: 30000 }],
          },
        },
      ],
    ]);
  });

  it("never sends an expense without its exchange rate", () => {
    expect(() => expensePayload({ ...expense, rate: null }, new Set())).toThrow(/exchange rate/);
  });

  it("passes on what the database refused, in its words", async () => {
    const client = { from: () => null, rpc: async () => ({ error: { message: "only the person who added this can change it" } }) };
    await expect(saveExpense(client, expense, new Set())).rejects.toThrow("only the person who added this can change it");
    await expect(deleteExpense(client, "e1")).rejects.toThrow("only the person who added");
  });

  it("adding a guest twice is fine, but two guests cannot share a name", async () => {
    const guest = { id: "g1", tripId: "t1", name: "Mia", addedBy: "u1" };
    const insertFails = (message: string) => ({ from: () => ({ insert: async () => ({ error: { message } }) }) });
    await addGuest(insertFails('duplicate key value violates unique constraint "trip_guests_pkey"'), guest);
    await expect(addGuest(insertFails('duplicate key value violates unique constraint "trip_guests_name_idx"'), guest)).rejects.toThrow("There's already someone called Mia");
  });
});
