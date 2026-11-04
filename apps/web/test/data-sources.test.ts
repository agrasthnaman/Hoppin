import { describe, expect, it, vi } from "vitest";
import { createDocumentSource } from "../src/data/document-source";
import { createTripSource } from "../src/data/trip-source";

type Row = Record<string, unknown>;

/** A tiny stand-in for the Supabase query builder: select, eq, in, not-is-null. Records what was asked. */
function fakeClient(tables: Record<string, Row[] | { error: string }>) {
  const calls: { table: string; filters: [string, string, unknown][] }[] = [];
  const client = {
    from(table: string) {
      return {
        select() {
          const filters: [string, string, unknown][] = [];
          calls.push({ table, filters });
          const run = () => {
            const t = tables[table];
            if (!t) return { data: [] as Row[], error: null };
            if ("error" in t) return { data: null, error: { message: t.error } };
            const data = t.filter((r) =>
              filters.every(([op, col, val]) =>
                op === "eq" ? r[col] === val : op === "notnull" ? r[col] !== null && r[col] !== undefined : (val as unknown[]).includes(r[col]),
              ),
            );
            return { data, error: null };
          };
          const builder: any = {
            eq(col: string, val: unknown) {
              filters.push(["eq", col, val]);
              return builder;
            },
            in(col: string, val: unknown[]) {
              filters.push(["in", col, val]);
              return builder;
            },
            not(col: string, op: string, val: unknown) {
              if (op !== "is" || val !== null) throw new Error(`fake client: not(${col}, ${op}) is not supported`);
              filters.push(["notnull", col, null]);
              return builder;
            },
            then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
              return Promise.resolve(run()).then(resolve, reject);
            },
          };
          return builder;
        },
      };
    },
  };
  return { client, calls };
}

const tables = () => ({
  trips: [{ id: "t1", name: "Goa", start_date: "2026-12-01", end_date: "2026-12-05" }],
  members: [
    { trip_id: "t1", user_id: "u1", role: "organizer", status: "approved", can_edit_all: false },
    { trip_id: "t1", user_id: "u2", role: "member", status: "approved", can_edit_all: false },
  ],
  profiles: [
    { user_id: "u1", display_name: "Neha" },
    { user_id: "u2", display_name: "Aman" },
  ],
  items: [
    { id: "i1", trip_id: "t1", owner_id: "u1", kind: "stay", visibility: "shared", group_item: true, starts_at: "2026-12-01T04:30:00+00:00", ends_at: null, tz: "UTC", title: "Hotel", location_url: null, details: {}, version: 1 },
    { id: "i9", trip_id: "other", owner_id: "u1", kind: "stay", visibility: "shared", group_item: true, starts_at: "2026-12-01T04:30:00+00:00", ends_at: null, tz: "UTC", title: "Someone else's", location_url: null, details: {}, version: 1 },
  ],
  rsvps: [{ item_id: "i1", user_id: "u2" }, { item_id: "i9", user_id: "u2" }],
  documents: [{ id: "d1", trip_id: "t1", item_id: "i1", owner_id: "u1", scope: "shared", storage_path: "t1/u1/d1-ticket.pdf", kind: "ticket" }],
  trip_guests: [{ id: "g1", trip_id: "t1", name: "Mia", added_by: "u2" }],
  expenses: [
    { id: "e1", trip_id: "t1", kind: "expense", title: "Dinner", category: "food", paid_by_user: null, paid_by_guest: "g1", amount: "300000", currency: "IDR", rate: "0.0053", rate_date: "2026-12-01", base_currency: "INR", spent_on: "2026-12-01", created_by: "u2", version: 2, created_at: "2026-12-01T10:00:00+00:00" },
  ],
  expense_shares: [
    { expense_id: "e1", trip_id: "t1", position: 1, user_id: "u2", guest_id: null, share: null },
    { expense_id: "e1", trip_id: "t1", position: 0, user_id: null, guest_id: "g1", share: null },
  ],
  change_log: [
    { trip_id: "t1", item_id: "i1", expense_id: null, actor_id: "u1", op: "insert", changed_at: "2026-12-01T09:00:00+00:00", before: null, after: {} },
    { trip_id: "t1", item_id: null, expense_id: "e1", actor_id: "u2", op: "insert", changed_at: "2026-12-01T10:00:00+00:00", before: null, after: { id: "e1", trip_id: "t1", kind: "expense", title: "Dinner", category: "food", paid_by_user: null, paid_by_guest: "g1", amount: 250000, currency: "IDR", rate: 0.0053, rate_date: "2026-12-01", base_currency: "INR", spent_on: "2026-12-01", created_by: "u2", shares: [{ user_id: null, guest_id: "g1", share: null }] } },
  ],
});

describe("createTripSource", () => {
  it("assembles a snapshot of one trip, with names, items, RSVPs and documents", async () => {
    const { client } = fakeClient(tables());
    const result = await createTripSource(client).fetchSnapshot("t1");
    if (result.status !== "ok") throw new Error("expected ok");
    const s = result.snapshot;
    expect(s.trip.name).toBe("Goa");
    expect(s.members.map((m) => m.displayName)).toEqual(["Neha", "Aman"]);
    expect(s.items.map((i) => i.title)).toEqual(["Hotel"]);
    expect(s.rsvps).toEqual([{ itemId: "i1", userId: "u2" }]);
    expect(s.documents.map((d) => d.fileName)).toEqual(["d1-ticket.pdf"]);
  });

  it("reads the trip's money: its counting currency, guests, expenses with their split in order, and their history", async () => {
    const { client } = fakeClient({ ...tables(), trips: [{ id: "t1", name: "Goa", start_date: null, end_date: null, base_currency: "INR" }] });
    const result = await createTripSource(client).fetchSnapshot("t1");
    if (result.status !== "ok") throw new Error("expected ok");
    const s = result.snapshot;
    expect(s.trip.baseCurrency).toBe("INR");
    expect(s.guests).toEqual([{ id: "g1", tripId: "t1", name: "Mia", addedBy: "u2" }]);
    expect(s.expenses).toEqual([
      {
        id: "e1", tripId: "t1", kind: "expense", title: "Dinner", category: "food", paidBy: "g1", amount: 300000, currency: "IDR", rate: 0.0053,
        rateDate: "2026-12-01", baseCurrency: "INR", spentOn: "2026-12-01", split: [{ who: "g1" }, { who: "u2" }], createdBy: "u2", version: 2,
        createdAt: "2026-12-01T10:00:00.000Z",
      },
    ]);
    expect(s.expenseHistory?.map((h) => [h.expenseId, h.op, h.after?.amount])).toEqual([["e1", "insert", 250000]]);
  });

  it("reports no access when the trip is not visible (removed or never joined)", async () => {
    const { client } = fakeClient({ ...tables(), trips: [] });
    expect(await createTripSource(client).fetchSnapshot("t1")).toEqual({ status: "no-access" });
  });

  it("fails loudly if any query fails, so a half-loaded trip is never stored", async () => {
    const { client } = fakeClient({ ...tables(), items: { error: "boom" } });
    await expect(createTripSource(client).fetchSnapshot("t1")).rejects.toThrow("boom");
  });

  it("does not ask for RSVPs when the trip has no items", async () => {
    const { client, calls } = fakeClient({ ...tables(), items: [] });
    await createTripSource(client).fetchSnapshot("t1");
    expect(calls.some((c) => c.table === "rsvps")).toBe(false);
  });

  it("limits every query to the requested trip", async () => {
    const { client, calls } = fakeClient(tables());
    await createTripSource(client).fetchSnapshot("t1");
    const filtered = (table: string) => calls.find((c) => c.table === table)?.filters ?? [];
    expect(filtered("trips")).toContainEqual(["eq", "id", "t1"]);
    for (const t of ["members", "items", "documents", "trip_guests", "expenses", "expense_shares", "change_log"]) expect(filtered(t), t).toContainEqual(["eq", "trip_id", "t1"]);
  });
});

describe("createDocumentSource", () => {
  const doc = { id: "d1", tripId: "t1", itemId: null, ownerId: "u1", scope: "shared" as const, storagePath: "t1/u1/d1-x.pdf", kind: "ticket", fileName: "x.pdf" };

  it("downloads a file's bytes and type", async () => {
    const download = vi.fn().mockResolvedValue({ data: new Blob(["hello"], { type: "application/pdf" }), error: null });
    const source = createDocumentSource({ storage: { from: () => ({ download }) } });
    const { data, contentType } = await source.download(doc);
    expect(download).toHaveBeenCalledWith("t1/u1/d1-x.pdf");
    expect(new TextDecoder().decode(data)).toBe("hello");
    expect(contentType).toBe("application/pdf");
  });

  it("throws when the file cannot be downloaded", async () => {
    const source = createDocumentSource({ storage: { from: () => ({ download: async () => ({ data: null, error: { message: "not found" } }) }) } });
    await expect(source.download(doc)).rejects.toThrow("not found");
  });
});
