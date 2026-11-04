import { describe, expect, it } from "vitest";
import { createTripSource } from "../src/data/trip-source";

type Row = Record<string, unknown>;

/** A tiny stand-in for the Supabase query builder (select, eq, in, not-is-null) that records what was asked. */
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
            const keep = (r: Row) =>
              filters.every(([op, col, val]) => (op === "eq" ? r[col] === val : op === "notnull" ? r[col] !== null && r[col] !== undefined : (val as unknown[]).includes(r[col])));
            return { data: t.filter(keep), error: null };
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

const base = () => ({
  trips: [{ id: "t1", name: "Goa", start_date: null, end_date: null }],
  members: [{ trip_id: "t1", user_id: "u1", role: "organizer", status: "approved", can_edit_all: false }],
  profiles: [{ user_id: "u1", display_name: "Neha" }],
});

const withPolls = () => ({
  ...base(),
  polls: [
    { id: "p2", trip_id: "t1", created_by: "u1", question: "Dinner?", multiple: true, closed_at: null, created_at: "2026-12-02T10:00:00+00:00" },
    { id: "p1", trip_id: "t1", created_by: null, question: "Which beach?", multiple: false, closed_at: "2026-12-02T12:00:00+00:00", created_at: "2026-12-01T10:00:00+00:00" },
  ],
  poll_options: [
    { id: "o2", poll_id: "p1", trip_id: "t1", label: "Palolem", position: 1 },
    { id: "o1", poll_id: "p1", trip_id: "t1", label: "Baga", position: 0 },
    { id: "o3", poll_id: "p2", trip_id: "t1", label: "Thali", position: 0 },
  ],
  poll_votes: [{ poll_id: "p1", option_id: "o1", trip_id: "t1", user_id: "u1" }],
});

describe("createTripSource: polls", () => {
  it("loads polls oldest first with options in written order, whether closed, who asked, and the votes", async () => {
    const result = await createTripSource(fakeClient(withPolls()).client).fetchSnapshot("t1");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.snapshot.polls?.map((p) => [p.question, p.closed, p.multiple, p.createdBy])).toEqual([
      ["Which beach?", true, false, null],
      ["Dinner?", false, true, "u1"],
    ]);
    expect(result.snapshot.polls?.[0]?.options.map((o) => o.label)).toEqual(["Baga", "Palolem"]);
    expect(result.snapshot.polls?.[0]?.createdAt).toBe("2026-12-01T10:00:00.000Z");
    expect(result.snapshot.votes).toEqual([{ pollId: "p1", optionId: "o1", userId: "u1" }]);
  });

  it("limits the poll queries to the trip", async () => {
    const { client, calls } = fakeClient(withPolls());
    await createTripSource(client).fetchSnapshot("t1");
    for (const table of ["polls", "poll_options", "poll_votes"]) {
      expect(calls.find((c) => c.table === table)?.filters, table).toContainEqual(["eq", "trip_id", "t1"]);
    }
  });

  it("a trip without polls has empty lists", async () => {
    const result = await createTripSource(fakeClient(base()).client).fetchSnapshot("t1");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.snapshot.polls).toEqual([]);
    expect(result.snapshot.votes).toEqual([]);
  });

  it("fails loudly if the polls cannot be read, so a half-loaded trip is never stored", async () => {
    const { client } = fakeClient({ ...base(), polls: { error: "no polls" } });
    await expect(createTripSource(client).fetchSnapshot("t1")).rejects.toThrow("no polls");
  });
});
