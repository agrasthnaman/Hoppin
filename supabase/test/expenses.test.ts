import type { PGlite } from "@electric-sql/pglite";
import { computeSettlement, type Expense } from "@hoppin/core";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, id, seededDb, visibleIds } from "./helpers";

let db: PGlite;
beforeEach(async () => {
  db = await seededDb();
});

const uuid = () => crypto.randomUUID();
const call = (user: string, sql: string, params: unknown[] = []) => asUser(db, user, (tx) => tx.query(sql, params));
const rows = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

type Share = { user_id?: string; guest_id?: string; share?: number };
type Payload = Record<string, unknown> & { id: string; shares: Share[] };

/** An equal three-way dinner Alice paid in rupees, the trip's counting currency. */
const dinner = (over: Partial<Payload> = {}): Payload => ({
  id: uuid(),
  trip_id: id.trip,
  kind: "expense",
  title: "Dinner",
  category: "food",
  paid_by_user: id.alice,
  paid_by_guest: null,
  amount: 300000,
  currency: "INR",
  rate: 1,
  rate_date: "2026-12-01",
  base_currency: "INR",
  spent_on: "2026-12-01",
  shares: [{ user_id: id.alice }, { user_id: id.bob }, { user_id: id.organizer }],
  ...over,
});

const save = (user: string, p: Payload) => call(user, "select save_expense($1::jsonb) as r", [JSON.stringify(p)]);
const remove = (user: string, expenseId: string) => call(user, "select delete_expense($1)", [expenseId]);
const addGuest = (user: string, name: string, over: Record<string, unknown> = {}) => {
  const g = { id: uuid(), trip_id: id.trip, name, added_by: user, ...over };
  return call(user, "insert into trip_guests (id, trip_id, name, added_by) values ($1, $2, $3, $4)", [g.id, g.trip_id, g.name, g.added_by]).then(() => g.id);
};

/** What each person is owed (+) or owes (-) in the trip, worked out from the stored rows the way the app does. */
async function balances(): Promise<Record<string, number>> {
  const expenses = await rows<{ id: string; paid_by_user: string | null; paid_by_guest: string | null; amount: string; currency: string; rate: string }>(
    "select id, paid_by_user, paid_by_guest, amount, currency, rate from expenses where trip_id = $1 order by created_at, id",
    [id.trip],
  );
  const shares = await rows<{ expense_id: string; user_id: string | null; guest_id: string | null; share: string | null }>(
    "select expense_id, user_id, guest_id, share from expense_shares where trip_id = $1 order by position",
    [id.trip],
  );
  const list: Expense[] = expenses.map((e) => ({
    paidBy: (e.paid_by_user ?? e.paid_by_guest) as string,
    amount: Number(e.amount),
    currency: e.currency,
    rate: Number(e.rate),
    split: shares
      .filter((s) => s.expense_id === e.id)
      .map((s) => ({ who: (s.user_id ?? s.guest_id) as string, ...(s.share === null ? {} : { share: Number(s.share) }) })),
  }));
  return computeSettlement(list, "INR").balances;
}

describe("who can read expenses", () => {
  it("an expense is readable only by approved members of that trip", async () => {
    const e = dinner();
    await save(id.alice, e);
    for (const user of [id.organizer, id.alice, id.bob, id.editor]) {
      expect(await visibleIds(db, user, "expenses"), user).toEqual([e.id]);
    }
    for (const user of [id.pending, id.removed, id.outsider, id.otherOrganizer]) {
      expect(await visibleIds(db, user, "expenses"), user).toEqual([]);
      const shares = await call(user, "select 1 from expense_shares");
      expect(shares.rows, user).toHaveLength(0);
    }
  });

  it("guests are visible to approved members of their trip only", async () => {
    const guest = await addGuest(id.alice, "Mia");
    expect(await visibleIds(db, id.bob, "trip_guests")).toEqual([guest]);
    for (const user of [id.pending, id.removed, id.outsider, id.otherOrganizer]) {
      expect(await visibleIds(db, user, "trip_guests"), user).toEqual([]);
    }
  });

  it("the history of an expense is readable by approved members only", async () => {
    await save(id.alice, dinner());
    const history = (user: string) => call(user, "select op from change_log where expense_id is not null").then((r) => r.rows);
    expect(await history(id.bob)).toEqual([{ op: "insert" }]);
    for (const user of [id.pending, id.removed, id.outsider]) expect(await history(user), user).toEqual([]);
  });

  it("nobody can write expense tables directly; changes go through save_expense and delete_expense", async () => {
    const e = dinner();
    await save(id.alice, e);
    await expect(call(id.alice, "update expenses set amount = 1 where id = $1", [e.id])).rejects.toThrow(/permission/);
    await expect(call(id.alice, "delete from expense_shares where expense_id = $1", [e.id])).rejects.toThrow(/permission/);
    await expect(
      call(id.alice, "insert into expenses (id, trip_id, kind, title, category, paid_by_user, amount, currency, rate, rate_date, base_currency, spent_on, created_by) values ($1, $2, 'expense', 'x', 'food', $3, 1, 'INR', 1, '2026-12-01', 'INR', '2026-12-01', $3)", [uuid(), id.trip, id.alice]),
    ).rejects.toThrow(/permission/);
  });
});

describe("adding an expense", () => {
  it("stores the expense, its split in order, and who added it", async () => {
    const e = dinner({ created_by: id.bob });
    await save(id.alice, e);
    const [stored] = await rows<{ created_by: string; amount: string; version: number }>("select created_by, amount::text, version from expenses where id = $1", [e.id]);
    expect(stored).toEqual({ created_by: id.alice, amount: "300000", version: 1 });
    const split = await rows<{ user_id: string }>("select user_id from expense_shares where expense_id = $1 order by position", [e.id]);
    expect(split.map((s) => s.user_id)).toEqual([id.alice, id.bob, id.organizer]);
  });

  it("the first expense sets the trip's counting currency, and later ones must use it", async () => {
    await save(id.alice, dinner());
    expect((await rows<{ base_currency: string }>("select base_currency from trips where id = $1", [id.trip]))[0]?.base_currency).toBe("INR");
    await expect(save(id.bob, dinner({ base_currency: "USD", currency: "USD", rate: 1 }))).rejects.toThrow(/base_currency:INR/);
  });

  it("keeps the rate captured when it was entered, for a bill in another currency", async () => {
    const e = dinner({ amount: 300000000, currency: "IDR", rate: 0.0053, rate_date: "2026-11-30" });
    await save(id.alice, e);
    const [stored] = await rows<{ rate: string; rate_date: string }>("select rate::text, rate_date::text from expenses where id = $1", [e.id]);
    expect(stored).toEqual({ rate: "0.0053", rate_date: "2026-11-30" });
  });

  it("a bill in the counting currency has a rate of exactly 1", async () => {
    await expect(save(id.alice, dinner({ rate: 1.1 }))).rejects.toThrow();
  });

  it("only approved members of the trip can add expenses", async () => {
    for (const user of [id.pending, id.removed, id.outsider, id.otherOrganizer]) {
      await expect(save(user, dinner({ paid_by_user: user, shares: [{ user_id: user }] })), user).rejects.toThrow(/approved members/);
    }
  });

  it("whoever paid and everyone in the split must be in the trip", async () => {
    await expect(save(id.alice, dinner({ paid_by_user: id.outsider }))).rejects.toThrow(/whoever paid/);
    await expect(save(id.alice, dinner({ paid_by_user: id.pending }))).rejects.toThrow(/whoever paid/);
    await expect(save(id.alice, dinner({ shares: [{ user_id: id.alice }, { user_id: id.outsider }] }))).rejects.toThrow(/in the trip/);
  });

  it("guests can pay and be in the split, but only guests of this trip", async () => {
    const mia = await addGuest(id.alice, "Mia");
    const e = dinner({ paid_by_user: null, paid_by_guest: mia, shares: [{ guest_id: mia }, { user_id: id.bob }] });
    await save(id.alice, e);
    expect(await balances()).toEqual({ [mia]: 150000, [id.bob]: -150000 });

    const elsewhere = uuid();
    await db.query("insert into trip_guests (id, trip_id, name, added_by) values ($1, $2, 'Zoe', $3)", [elsewhere, id.otherTrip, id.otherOrganizer]);
    await expect(save(id.alice, dinner({ shares: [{ user_id: id.alice }, { guest_id: elsewhere }] }))).rejects.toThrow();
    await expect(save(id.alice, dinner({ paid_by_user: null, paid_by_guest: elsewhere }))).rejects.toThrow();
  });

  it("exact amounts must add up to the bill, and everyone appears once", async () => {
    await expect(save(id.alice, dinner({ shares: [{ user_id: id.alice, share: 100000 }, { user_id: id.bob, share: 100000 }] }))).rejects.toThrow(/add up/);
    await expect(save(id.alice, dinner({ shares: [{ user_id: id.alice, share: 300000 }, { user_id: id.bob }] }))).rejects.toThrow(/everyone in the split, or for nobody/);
    await expect(save(id.alice, dinner({ shares: [{ user_id: id.alice }, { user_id: id.alice }] }))).rejects.toThrow(/twice/);
    await expect(save(id.alice, dinner({ shares: [] }))).rejects.toThrow(/nobody/);
    const e = dinner({ shares: [{ user_id: id.alice, share: 200000 }, { user_id: id.bob, share: 100000 }] });
    await save(id.alice, e);
    expect(await balances()).toEqual({ [id.alice]: 100000, [id.bob]: -100000 });
  });
});

describe("editing an expense", () => {
  it("editing an expense recalculates balances and writes a change entry", async () => {
    const e = dinner();
    await save(id.alice, e);
    expect(await balances()).toEqual({ [id.alice]: 200000, [id.bob]: -100000, [id.organizer]: -100000 });

    await save(id.alice, { ...e, amount: 450000, shares: [{ user_id: id.alice }, { user_id: id.bob }] });
    expect(await balances()).toEqual({ [id.alice]: 225000, [id.bob]: -225000 });

    const log = await rows<{ op: string; actor_id: string; before: { amount: number } | null; after: { amount: number; shares: Share[] } }>(
      "select op, actor_id, before, after from change_log where expense_id = $1 order by id",
      [e.id],
    );
    expect(log.map((l) => l.op)).toEqual(["insert", "update"]);
    expect(log[1]?.actor_id).toBe(id.alice);
    expect(log[1]?.before?.amount).toBe(300000);
    expect(log[1]?.after.amount).toBe(450000);
    expect(log[1]?.after.shares).toHaveLength(2);
    expect((await rows<{ version: number }>("select version from expenses where id = $1", [e.id]))[0]?.version).toBe(2);
  });

  it("only the person who added it can change or delete it, not even an organizer", async () => {
    const e = dinner();
    await save(id.alice, e);
    for (const user of [id.bob, id.organizer, id.editor]) {
      await expect(save(user, { ...e, amount: 1 }), user).rejects.toThrow(/only the person who added/);
      await expect(remove(user, e.id), user).rejects.toThrow(/only the person who added/);
    }
  });

  it("sending the same expense again (a retry from a phone) changes nothing and writes no history", async () => {
    const e = dinner();
    await save(id.alice, e);
    await save(id.alice, e);
    const log = await rows("select 1 from change_log where expense_id = $1", [e.id]);
    expect(log).toHaveLength(1);
    expect((await rows<{ version: number }>("select version from expenses where id = $1", [e.id]))[0]?.version).toBe(1);
  });

  it("someone who left can still be kept on an expense they were already on", async () => {
    const e = dinner();
    await save(id.alice, e);
    await call(id.organizer, "select remove_member($1, $2)", [id.trip, id.bob]);
    await save(id.alice, { ...e, title: "Dinner by the sea" });
    await expect(save(id.alice, dinner({ shares: [{ user_id: id.alice }, { user_id: id.bob }] }))).rejects.toThrow(/in the trip/);
  });

  it("an expense cannot become a payment", async () => {
    const e = dinner();
    await save(id.alice, e);
    await expect(save(id.alice, { ...e, kind: "payment", shares: [{ user_id: id.bob }] })).rejects.toThrow();
  });
});

describe("marking a payment as paid", () => {
  const payment = (over: Partial<Payload> = {}): Payload =>
    dinner({ kind: "payment", title: "Paid back", category: "payment", paid_by_user: id.bob, amount: 100000, shares: [{ user_id: id.alice }], ...over });

  it("the person getting the money records it, and it settles the balance", async () => {
    await save(id.alice, dinner());
    await save(id.alice, payment());
    expect(await balances()).toEqual({ [id.alice]: 100000, [id.bob]: 0, [id.organizer]: -100000 });
  });

  it("the person paying cannot mark it paid themselves", async () => {
    await expect(save(id.bob, payment())).rejects.toThrow(/only the person who gets the money/);
  });

  it("whoever added a guest marks payments to that guest", async () => {
    const mia = await addGuest(id.alice, "Mia");
    await save(id.alice, payment({ shares: [{ guest_id: mia }] }));
    await expect(save(id.organizer, payment({ shares: [{ guest_id: mia }] }))).rejects.toThrow(/only the person who gets the money/);
  });

  it("a payment goes to one person, in the counting currency, and not to the payer", async () => {
    await save(id.alice, dinner());
    await expect(save(id.alice, payment({ shares: [{ user_id: id.alice }, { user_id: id.organizer }] }))).rejects.toThrow(/exactly one person/);
    await expect(save(id.alice, payment({ currency: "USD", rate: 84 }))).rejects.toThrow(/counting currency/);
    await expect(save(id.alice, payment({ paid_by_user: id.alice }))).rejects.toThrow(/themselves/);
  });
});

describe("deleting an expense", () => {
  it("the person who added it deletes it, history keeps an entry, and deleting twice is harmless", async () => {
    const e = dinner();
    await save(id.alice, e);
    await remove(id.alice, e.id);
    await remove(id.alice, e.id);
    expect(await visibleIds(db, id.alice, "expenses")).toEqual([]);
    expect((await rows<{ op: string }>("select op from change_log where expense_id = $1 order by id", [e.id])).map((r) => r.op)).toEqual(["insert", "delete"]);
  });
});

describe("guests", () => {
  it("an approved member adds a guest as themselves", async () => {
    await addGuest(id.bob, "Rohan");
    await expect(addGuest(id.bob, "Kadek", { added_by: id.alice })).rejects.toThrow();
    for (const user of [id.pending, id.removed, id.outsider]) await expect(addGuest(user, `Guest of ${user}`), user).rejects.toThrow();
  });

  it("two guests in one trip cannot share a name", async () => {
    await addGuest(id.bob, "Mia");
    await expect(addGuest(id.alice, " mia ")).rejects.toThrow();
  });
});

describe("the trip's counting currency", () => {
  it("cannot be changed once set, even by the organizer", async () => {
    await save(id.alice, dinner());
    await expect(call(id.organizer, "update trips set base_currency = 'USD' where id = $1", [id.trip])).rejects.toThrow(/counting currency/);
  });
});

describe("when people and trips go", () => {
  it("expenses stay when someone leaves the trip or deletes their account", async () => {
    const e = dinner();
    await save(id.alice, e);
    await call(id.bob, "select leave_trip($1)", [id.trip]);
    await call(id.alice, "select delete_my_account()");
    expect(await visibleIds(db, id.organizer, "expenses")).toEqual([e.id]);
  });

  it("deleting a trip removes its expenses, splits and guests", async () => {
    const mia = await addGuest(id.alice, "Mia");
    await save(id.alice, dinner({ shares: [{ user_id: id.alice }, { guest_id: mia }] }));
    await call(id.organizer, "delete from trips where id = $1", [id.trip]);
    for (const table of ["expenses", "expense_shares", "trip_guests"]) {
      expect((await rows(`select 1 from ${table}`)).length, table).toBe(0);
    }
  });
});
