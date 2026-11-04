import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, id, seededDb } from "./helpers";

let db: PGlite;
beforeEach(async () => {
  db = await seededDb();
});

const ask = (user: string, options: string[] = ["Baga", "Palolem", "Anjuna"], multiple = false, trip: string = id.trip) =>
  asUser(db, user, async (tx) => {
    const r = await tx.query<{ create_poll: string }>("select create_poll($1, 'Which beach?', $2, $3) as create_poll", [trip, multiple, options]);
    return r.rows[0]!.create_poll;
  });

const optionIds = async (poll: string) =>
  (await db.query<{ id: string }>("select id from poll_options where poll_id = $1 order by position", [poll])).rows.map((r) => r.id);

const vote = (user: string, poll: string, options: string[]) => asUser(db, user, (tx) => tx.query("select cast_vote($1, $2::uuid[])", [poll, options]));
const votesIn = (poll: string) => db.query<{ user_id: string; option_id: string }>("select user_id, option_id from poll_votes where poll_id = $1", [poll]);
const seenBy = (user: string, table: string) => asUser(db, user, async (tx) => (await tx.query(`select 1 from ${table}`)).rows.length);

describe("creating a poll", () => {
  it("a member creates a poll with its options in the order written, blanks skipped", async () => {
    const poll = await ask(id.alice, ["Baga", "  ", "Palolem"]);
    const labels = await db.query<{ label: string; position: number }>("select label, position from poll_options where poll_id = $1 order by position", [poll]);
    expect(labels.rows).toEqual([{ label: "Baga", position: 0 }, { label: "Palolem", position: 1 }]);
    const row = await db.query<{ created_by: string; trip_id: string; closed_at: string | null }>("select created_by, trip_id, closed_at from polls where id = $1", [poll]);
    expect(row.rows[0]).toEqual({ created_by: id.alice, trip_id: id.trip, closed_at: null });
  });

  it("needs a question and two different options", async () => {
    await expect(ask(id.alice, ["Only one"])).rejects.toThrow("add at least 2 options");
    await expect(ask(id.alice, ["Goa", "goa "])).rejects.toThrow("each option must be different");
    await expect(
      asUser(db, id.alice, (tx) => tx.query("select create_poll($1, '  ', false, array['a','b'])", [id.trip])),
    ).rejects.toThrow("enter a question");
    await expect(ask(id.alice, Array.from({ length: 11 }, (_, i) => `o${i}`))).rejects.toThrow("at most 10");
  });

  it("people outside the trip, pending and removed members cannot create polls", async () => {
    for (const user of [id.outsider, id.pending, id.removed]) {
      await expect(ask(user), user).rejects.toThrow("only members of this trip");
    }
  });

  it("direct inserts into the tables are refused", async () => {
    await expect(
      asUser(db, id.alice, (tx) => tx.query("insert into polls (trip_id, created_by, question) values ($1, $2, 'x')", [id.trip, id.alice])),
    ).rejects.toThrow();
  });
});

describe("who can read a poll", () => {
  it("approved members see polls, options and votes of their trip; nobody else does", async () => {
    const poll = await ask(id.alice);
    const [first] = await optionIds(poll);
    await vote(id.bob, poll, [first!]);
    for (const user of [id.organizer, id.alice, id.bob, id.editor]) {
      expect(await seenBy(user, "polls"), user).toBe(1);
      expect(await seenBy(user, "poll_options"), user).toBe(3);
      expect(await seenBy(user, "poll_votes"), user).toBe(1);
    }
    for (const user of [id.outsider, id.pending, id.removed, id.otherOrganizer]) {
      for (const table of ["polls", "poll_options", "poll_votes"]) expect(await seenBy(user, table), `${user} ${table}`).toBe(0);
    }
  });

  it("votes of someone who is no longer an approved member stop showing", async () => {
    const poll = await ask(id.alice);
    const [first] = await optionIds(poll);
    await vote(id.bob, poll, [first!]);
    await db.query("update members set status = 'removed' where user_id = $1", [id.bob]);
    expect(await seenBy(id.alice, "poll_votes")).toBe(0);
  });
});

describe("voting", () => {
  it("one vote per member on a single-choice poll, and changing it replaces it", async () => {
    const poll = await ask(id.alice);
    const [a, b] = await optionIds(poll);
    await vote(id.bob, poll, [a!]);
    await vote(id.bob, poll, [b!]);
    expect((await votesIn(poll)).rows).toEqual([{ user_id: id.bob, option_id: b }]);
    await expect(vote(id.bob, poll, [a!, b!])).rejects.toThrow("choose one option");
    expect((await votesIn(poll)).rows).toHaveLength(1);
  });

  it("a multiple-choice poll takes several options, and an empty choice withdraws", async () => {
    const poll = await ask(id.alice, ["a", "b", "c"], true);
    const [a, b] = await optionIds(poll);
    await vote(id.bob, poll, [a!, b!, a!]);
    expect((await votesIn(poll)).rows).toHaveLength(2);
    await vote(id.bob, poll, []);
    expect((await votesIn(poll)).rows).toHaveLength(0);
  });

  it("voting as someone else or voting in a poll of another trip is not possible", async () => {
    const poll = await ask(id.alice);
    const [a] = await optionIds(poll);
    await expect(vote(id.outsider, poll, [a!])).rejects.toThrow("poll not found");
    await expect(vote(id.pending, poll, [a!])).rejects.toThrow("poll not found");
    await expect(vote(id.removed, poll, [a!])).rejects.toThrow("poll not found");
    await expect(vote(id.otherOrganizer, poll, [a!])).rejects.toThrow("poll not found");
    await expect(asUser(db, id.bob, (tx) => tx.query("insert into poll_votes (poll_id, option_id, trip_id, user_id) values ($1, $2, $3, $4)", [poll, a, id.trip, id.alice]))).rejects.toThrow();
  });

  it("an option of a different poll is refused", async () => {
    const one = await ask(id.alice);
    const two = await ask(id.alice);
    const [foreign] = await optionIds(two);
    await expect(vote(id.bob, one, [foreign!])).rejects.toThrow("that option is not in this poll");
  });

  it("a closed poll takes no votes and keeps the ones it has", async () => {
    const poll = await ask(id.alice);
    const [a, b] = await optionIds(poll);
    await vote(id.bob, poll, [a!]);
    await asUser(db, id.alice, (tx) => tx.query("select close_poll($1)", [poll]));
    await expect(vote(id.bob, poll, [b!])).rejects.toThrow("this poll is closed");
    expect((await votesIn(poll)).rows).toEqual([{ user_id: id.bob, option_id: a }]);
  });
});

describe("closing and deleting", () => {
  it("the person who asked and an organizer can close; another member cannot", async () => {
    const poll = await ask(id.alice);
    await expect(asUser(db, id.bob, (tx) => tx.query("select close_poll($1)", [poll]))).rejects.toThrow("only the person who asked or an organizer");
    await asUser(db, id.organizer, (tx) => tx.query("select close_poll($1)", [poll]));
    const row = await db.query<{ closed_at: string | null }>("select closed_at from polls where id = $1", [poll]);
    expect(row.rows[0]!.closed_at).not.toBeNull();
    const other = await ask(id.alice);
    await asUser(db, id.alice, (tx) => tx.query("select close_poll($1)", [other]));
  });

  it("a poll cannot be changed with a direct update", async () => {
    const poll = await ask(id.alice);
    await expect(asUser(db, id.alice, (tx) => tx.query("update polls set question = 'changed' where id = $1", [poll]))).rejects.toThrow();
  });

  it("the person who asked and an organizer can delete a poll; its options and votes go with it", async () => {
    const poll = await ask(id.alice);
    const [a] = await optionIds(poll);
    await vote(id.bob, poll, [a!]);
    const bobDeletes = await asUser(db, id.bob, async (tx) => (await tx.query("delete from polls where id = $1 returning id", [poll])).rows.length);
    expect(bobDeletes).toBe(0);
    const organizerDeletes = await asUser(db, id.organizer, async (tx) => (await tx.query("delete from polls where id = $1 returning id", [poll])).rows.length);
    expect(organizerDeletes).toBe(1);
    expect((await db.query("select 1 from poll_options where poll_id = $1", [poll])).rows).toHaveLength(0);
    expect((await votesIn(poll)).rows).toHaveLength(0);
  });

  it("the poll stays for the group when the person who asked deletes their account", async () => {
    const asker = "00000000-0000-0000-0000-0000000000f1"; // a member with nothing else in the trip, so the account can go
    await db.query("insert into auth.users (id) values ($1)", [asker]);
    await db.query("insert into members (trip_id, user_id, role, status) values ($1, $2, 'member', 'approved')", [id.trip, asker]);
    const poll = await ask(asker);
    await db.query("delete from auth.users where id = $1", [asker]);
    const row = await db.query<{ created_by: string | null }>("select created_by from polls where id = $1", [poll]);
    expect(row.rows).toEqual([{ created_by: null }]);
  });
});
