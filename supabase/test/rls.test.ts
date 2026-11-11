import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, id, seededDb, visibleIds } from "./helpers";

let db: PGlite;
beforeEach(async () => {
  db = await seededDb();
});

/** Rows changed by an UPDATE/DELETE ... RETURNING run as a user. */
async function changed(userId: string, sql: string, params: unknown[] = []): Promise<number> {
  return asUser(db, userId, async (tx) => (await tx.query(sql, params)).rows.length);
}

describe("trips and members", () => {
  it("approved members can read their trip, and only theirs", async () => {
    expect(await visibleIds(db, id.alice, "trips")).toEqual([id.trip]);
    expect(await visibleIds(db, id.otherOrganizer, "trips")).toEqual([id.otherTrip]);
  });

  it("a signed-in non-member sees no trip data", async () => {
    for (const table of ["trips", "items", "documents", "change_log"]) {
      expect(await visibleIds(db, id.outsider, table), table).toEqual([]);
    }
    const members = await asUser(db, id.outsider, (tx) => tx.query("select 1 from members"));
    expect(members.rows).toHaveLength(0);
  });

  it("pending and removed members see no trip data, only their own membership row", async () => {
    for (const user of [id.pending, id.removed]) {
      for (const table of ["trips", "items", "documents", "change_log"]) {
        expect(await visibleIds(db, user, table), `${user} ${table}`).toEqual([]);
      }
      const rows = await asUser(db, user, (tx) => tx.query<{ user_id: string }>("select user_id from members"));
      expect(rows.rows.map((r) => r.user_id)).toEqual([user]);
    }
  });

  it("approved members can see who else is in the trip", async () => {
    const rows = await asUser(db, id.bob, (tx) =>
      tx.query<{ user_id: string }>("select user_id from members where trip_id = $1", [id.trip]),
    );
    expect(rows.rows.map((r) => r.user_id)).toContain(id.organizer);
    expect(rows.rows).toHaveLength(6);
  });

  it("create_trip makes the caller an approved organizer", async () => {
    const tripId = await asUser(db, id.outsider, async (tx) => {
      const r = await tx.query<{ create_trip: string }>("select create_trip('Hampi', '2027-01-01', '2027-01-05')");
      return r.rows[0]!.create_trip;
    });
    const member = await db.query<{ role: string; status: string }>(
      "select role, status from members where trip_id = $1 and user_id = $2",
      [tripId, id.outsider],
    );
    expect(member.rows[0]).toEqual({ role: "organizer", status: "approved" });
    expect(await visibleIds(db, id.outsider, "trips")).toContain(tripId);
  });

  it("users cannot insert trips directly", async () => {
    await expect(
      asUser(db, id.outsider, (tx) =>
        tx.query("insert into trips (name, created_by) values ('Sneaky', $1)", [id.outsider]),
      ),
    ).rejects.toThrow();
  });

  it("members cannot change their own role or status", async () => {
    expect(await changed(id.alice, "update members set role = 'organizer' where user_id = $1 returning 1", [id.alice])).toBe(0);
    const row = await db.query<{ role: string }>("select role from members where user_id = $1", [id.alice]);
    expect(row.rows[0]?.role).toBe("member");
  });

  it("the organizer can approve a pending member and grant edit rights", async () => {
    expect(
      await changed(id.organizer, "update members set status = 'approved' where user_id = $1 returning 1", [id.pending]),
    ).toBe(1);
    expect(
      await changed(id.organizer, "update members set can_edit_all = true where user_id = $1 returning 1", [id.bob]),
    ).toBe(1);
  });

  it("a plain member cannot approve anyone", async () => {
    expect(
      await changed(id.alice, "update members set status = 'approved' where user_id = $1 returning 1", [id.pending]),
    ).toBe(0);
  });

  it("removing a member ends their read access at once", async () => {
    expect(await visibleIds(db, id.alice, "items")).not.toEqual([]);
    await changed(id.organizer, "update members set status = 'removed' where user_id = $1 returning 1", [id.alice]);
    expect(await visibleIds(db, id.alice, "items")).toEqual([]);
    expect(await visibleIds(db, id.alice, "trips")).toEqual([]);
  });
});

describe("items", () => {
  it("a private item is invisible to every other member, including the organizer", async () => {
    for (const user of [id.bob, id.organizer, id.editor]) {
      expect(await visibleIds(db, user, "items", { column: "id", value: id.alicePrivate }), user).toEqual([]);
    }
    expect(await visibleIds(db, id.alice, "items", { column: "id", value: id.alicePrivate })).toEqual([id.alicePrivate]);
  });

  it("shared items are visible to approved members only", async () => {
    for (const user of [id.organizer, id.alice, id.bob, id.editor]) {
      const seen = await visibleIds(db, user, "items");
      expect(seen, user).toContain(id.stay);
      expect(seen, user).toContain(id.aliceOptional);
    }
    for (const user of [id.pending, id.removed, id.outsider, id.otherOrganizer]) {
      expect(await visibleIds(db, user, "items", { column: "trip_id", value: id.trip }), user).toEqual([]);
    }
  });

  it("members can create items they own, but not items owned by someone else", async () => {
    const insert = (owner: string) =>
      asUser(db, id.bob, (tx) =>
        tx.query(
          `insert into items (trip_id, owner_id, kind, visibility, starts_at, tz, title)
           values ($1, $2, 'activity', 'shared', now(), 'Asia/Kolkata', 'Beach walk')`,
          [id.trip, owner],
        ),
      );
    await expect(insert(id.bob)).resolves.toBeDefined();
    await expect(insert(id.alice)).rejects.toThrow();
  });

  it("non-members, pending and removed members cannot create items in the trip", async () => {
    for (const user of [id.outsider, id.pending, id.removed]) {
      await expect(
        asUser(db, user, (tx) =>
          tx.query(
            `insert into items (trip_id, owner_id, kind, visibility, starts_at, tz, title)
             values ($1, $2, 'plan', 'private', now(), 'Asia/Kolkata', 'Sneaky')`,
            [id.trip, user],
          ),
        ),
        user,
      ).rejects.toThrow();
    }
  });

  it("group items must be shared", async () => {
    await expect(
      db.query(
        `insert into items (trip_id, owner_id, kind, visibility, group_item, starts_at, tz, title)
         values ($1, $2, 'flight', 'private', true, now(), 'UTC', 'Bad')`,
        [id.trip, id.organizer],
      ),
    ).rejects.toThrow();
  });

  it("only the creator, the organizer, or a granted editor can update an item", async () => {
    const update = (user: string) =>
      changed(user, "update items set title = 'Museum (updated)' where id = $1 returning 1", [id.aliceOptional]);
    expect(await update(id.bob)).toBe(0);
    expect(await update(id.pending)).toBe(0);
    expect(await update(id.removed)).toBe(0);
    expect(await update(id.alice)).toBe(1);
    expect(await update(id.organizer)).toBe(1);
    expect(await update(id.editor)).toBe(1);
  });

  it("the organizer cannot see or edit another member's private item", async () => {
    expect(await changed(id.organizer, "update items set title = 'x' where id = $1 returning 1", [id.alicePrivate])).toBe(0);
    expect(await changed(id.editor, "update items set title = 'x' where id = $1 returning 1", [id.alicePrivate])).toBe(0);
  });

  it("an editor cannot make someone else's shared item private", async () => {
    await expect(
      asUser(db, id.editor, (tx) =>
        tx.query("update items set visibility = 'private' where id = $1", [id.aliceOptional]),
      ),
    ).rejects.toThrow();
  });

  it("the trip and owner of an item cannot change", async () => {
    await expect(
      asUser(db, id.alice, (tx) => tx.query("update items set owner_id = $1 where id = $2", [id.bob, id.aliceOptional])),
    ).rejects.toThrow();
    await expect(
      asUser(db, id.organizer, (tx) => tx.query("update items set trip_id = $1 where id = $2", [id.otherTrip, id.stay])),
    ).rejects.toThrow();
  });

  it("each update bumps the item version", async () => {
    await changed(id.alice, "update items set title = 'v2' where id = $1 returning 1", [id.aliceOptional]);
    await changed(id.alice, "update items set title = 'v3' where id = $1 returning 1", [id.aliceOptional]);
    const row = await db.query<{ version: number }>("select version from items where id = $1", [id.aliceOptional]);
    expect(row.rows[0]?.version).toBe(3);
  });

  it("deleting follows the same rule as updating", async () => {
    expect(await changed(id.bob, "delete from items where id = $1 returning 1", [id.aliceOptional])).toBe(0);
    expect(await changed(id.alice, "delete from items where id = $1 returning 1", [id.aliceOptional])).toBe(1);
  });
});

describe("rsvps", () => {
  const rsvp = (user: string, item: string, as: string = user) =>
    asUser(db, user, (tx) => tx.query("insert into rsvps (item_id, user_id) values ($1, $2)", [item, as]));

  it("a member can say they're in on a shared item, once", async () => {
    await expect(rsvp(id.bob, id.aliceOptional)).resolves.toBeDefined();
    await expect(rsvp(id.bob, id.aliceOptional)).rejects.toThrow();
  });

  it("nobody can RSVP to someone else's private item", async () => {
    await expect(rsvp(id.bob, id.alicePrivate)).rejects.toThrow();
  });

  it("nobody can RSVP on behalf of another member", async () => {
    await expect(rsvp(id.bob, id.aliceOptional, id.alice)).rejects.toThrow();
  });

  it("members who can see the item can see who is in, and people can withdraw", async () => {
    await rsvp(id.bob, id.aliceOptional);
    const seen = await asUser(db, id.organizer, (tx) => tx.query<{ user_id: string }>("select user_id from rsvps"));
    expect(seen.rows.map((r) => r.user_id)).toEqual([id.bob]);
    expect(await changed(id.alice, "delete from rsvps where user_id = $1 returning 1", [id.bob])).toBe(0);
    expect(await changed(id.bob, "delete from rsvps where user_id = $1 returning 1", [id.bob])).toBe(1);
  });
});

describe("documents", () => {
  it("shared documents are readable by approved members only", async () => {
    expect(await visibleIds(db, id.bob, "documents", { column: "id", value: id.ticketDoc })).toEqual([id.ticketDoc]);
    for (const user of [id.pending, id.removed, id.outsider]) {
      expect(await visibleIds(db, user, "documents"), user).toEqual([]);
    }
  });

  it("a personal document is readable only by its owner and the organizer", async () => {
    const passport = { column: "id", value: id.alicePassport };
    expect(await visibleIds(db, id.alice, "documents", passport)).toEqual([id.alicePassport]);
    expect(await visibleIds(db, id.organizer, "documents", passport)).toEqual([id.alicePassport]);
    for (const user of [id.bob, id.editor, id.pending, id.outsider]) {
      expect(await visibleIds(db, user, "documents", passport), user).toEqual([]);
    }
  });

  it("a member cannot add a document in someone else's name", async () => {
    await expect(
      asUser(db, id.bob, (tx) =>
        tx.query(
          "insert into documents (trip_id, owner_id, scope, storage_path, kind) values ($1, $2, 'personal', $3, 'visa')",
          [id.trip, id.alice, `${id.trip}/${id.alice}/x.pdf`],
        ),
      ),
    ).rejects.toThrow();
  });

  it("the owner can delete their personal document; the organizer cannot", async () => {
    expect(await changed(id.organizer, "delete from documents where id = $1 returning 1", [id.alicePassport])).toBe(0);
    expect(await changed(id.alice, "delete from documents where id = $1 returning 1", [id.alicePassport])).toBe(1);
  });

  it("the organizer can remove a shared document", async () => {
    expect(await changed(id.organizer, "delete from documents where id = $1 returning 1", [id.ticketDoc])).toBe(1);
  });

  it("a document cannot point at an item from another trip", async () => {
    await expect(
      db.query(
        "insert into documents (trip_id, item_id, owner_id, scope, storage_path, kind) values ($1, $2, $3, 'shared', $4, 'ticket')",
        [id.trip, id.otherTripItem, id.organizer, `${id.trip}/${id.organizer}/x.pdf`],
      ),
    ).rejects.toThrow();
  });

  it("deleting an item keeps its documents", async () => {
    await changed(id.organizer, "delete from items where id = $1 returning 1", [id.stay]);
    const doc = await db.query<{ item_id: string | null }>("select item_id from documents where id = $1", [id.ticketDoc]);
    expect(doc.rows[0]?.item_id).toBeNull();
  });
});

describe("change_log", () => {
  const logFor = (user: string, item: string) =>
    asUser(db, user, (tx) =>
      tx.query<{ op: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null }>(
        "select op, before, after from change_log where item_id = $1 order by id",
        [item],
      ),
    );

  it("an update records who, plus before and after", async () => {
    await changed(id.alice, "update items set title = 'Museum (new)' where id = $1 returning 1", [id.aliceOptional]);
    const { rows } = await logFor(id.bob, id.aliceOptional);
    const update = rows.find((r) => r.op === "update");
    expect(update?.before?.title).toBe("Museum");
    expect(update?.after?.title).toBe("Museum (new)");
    const actor = await db.query<{ actor_id: string }>(
      "select actor_id from change_log where item_id = $1 and op = 'update'",
      [id.aliceOptional],
    );
    expect(actor.rows[0]?.actor_id).toBe(id.alice);
  });

  it("inserts and deletes are logged too", async () => {
    await changed(id.alice, "delete from items where id = $1 returning 1", [id.aliceOptional]);
    const ops = (await logFor(id.bob, id.aliceOptional)).rows.map((r) => r.op);
    expect(ops).toEqual(["insert", "delete"]);
  });

  it("changes to a private item are not visible to other members", async () => {
    await changed(id.alice, "update items set title = 'Secret' where id = $1 returning 1", [id.alicePrivate]);
    expect((await logFor(id.bob, id.alicePrivate)).rows).toEqual([]);
    expect((await logFor(id.organizer, id.alicePrivate)).rows).toEqual([]);
    expect((await logFor(id.alice, id.alicePrivate)).rows.length).toBeGreaterThan(0);
  });

  it("sharing a private item does not expose its earlier private history", async () => {
    await changed(id.alice, "update items set visibility = 'shared' where id = $1 returning 1", [id.alicePrivate]);
    expect((await logFor(id.bob, id.alicePrivate)).rows).toEqual([]);
  });

  it("non-members and pending members see no log", async () => {
    await changed(id.alice, "update items set title = 'x' where id = $1 returning 1", [id.aliceOptional]);
    for (const user of [id.outsider, id.pending, id.removed]) {
      expect((await logFor(user, id.aliceOptional)).rows, user).toEqual([]);
    }
  });

  it("users cannot write to the log directly", async () => {
    await expect(
      asUser(db, id.alice, (tx) =>
        tx.query("insert into change_log (trip_id, op, item_visibility) values ($1, 'update', 'shared')", [id.trip]),
      ),
    ).rejects.toThrow();
  });
});

describe("deleting a trip", () => {
  it("the organizer can delete a trip, and everything in it goes with it", async () => {
    expect(await changed(id.organizer, "delete from trips where id = $1 returning 1", [id.trip])).toBe(1);
    for (const table of ["items", "members", "documents", "change_log", "rsvps"]) {
      const left = await db.query<{ n: number }>(`select count(*)::int as n from ${table} where ${table === "rsvps" ? "item_id in (select id from items)" : "trip_id = $1"}`, table === "rsvps" ? [] : [id.trip]);
      expect(left.rows[0]?.n, table).toBe(0);
    }
    // the other trip is untouched
    expect(await visibleIds(db, id.otherOrganizer, "trips")).toEqual([id.otherTrip]);
  });

  it("other members cannot delete a trip", async () => {
    expect(await changed(id.alice, "delete from trips where id = $1 returning 1", [id.trip])).toBe(0);
  });

  it("deleting a single item is still logged", async () => {
    await changed(id.alice, "delete from items where id = $1 returning 1", [id.aliceOptional]);
    const log = await db.query<{ op: string }>("select op from change_log where item_id = $1 order by id", [id.aliceOptional]);
    expect(log.rows.map((r) => r.op)).toEqual(["insert", "delete"]);
  });
});

describe("arrival time zone", () => {
  it("existing items have no arrival zone, so they keep showing in their own zone", async () => {
    const rows = await db.query("select end_tz from items");
    expect(rows.rows.length).toBeGreaterThan(0);
    expect(rows.rows.every((row) => (row as { end_tz: string | null }).end_tz === null)).toBe(true);
  });

  it("the organizer can store a flight with two zones", async () => {
    await asUser(db, id.organizer, (tx) =>
      tx.query(
        `insert into items (trip_id, owner_id, kind, visibility, group_item, starts_at, ends_at, tz, end_tz, title)
         values ($1, $2, 'flight', 'shared', true, '2026-12-01T17:30:00Z', '2026-12-02T04:30:00Z', 'Asia/Kolkata', 'Europe/London', 'DEL to LHR')`,
        [id.trip, id.organizer],
      ),
    );
    const saved = await db.query("select tz, end_tz from items where title = 'DEL to LHR'");
    expect(saved.rows).toEqual([{ tz: "Asia/Kolkata", end_tz: "Europe/London" }]);
  });
});

describe("trip destination", () => {
  it("new trips can be made with or without a destination, and old three-argument calls still work", async () => {
    await asUser(db, id.alice, (tx) => tx.query("select create_trip('Goa 2026', null, null, 'Goa, India', 15.49, 73.83)"));
    await asUser(db, id.alice, (tx) => tx.query("select create_trip('Plain', null, null)"));
    const rows = await db.query("select name, destination, destination_lat, destination_lon from trips where name in ('Goa 2026', 'Plain') order by name");
    expect(rows.rows).toEqual([
      { name: "Goa 2026", destination: "Goa, India", destination_lat: 15.49, destination_lon: 73.83 },
      { name: "Plain", destination: null, destination_lat: null, destination_lon: null },
    ]);
  });

  it("existing trips have no destination", async () => {
    const rows = await db.query("select destination from trips");
    expect(rows.rows.every((row) => (row as { destination: string | null }).destination === null)).toBe(true);
  });

  it("a destination needs its coordinates, and they must be real", async () => {
    await expect(db.query("update trips set destination = 'Goa' where id = $1", [id.trip])).rejects.toThrow();
    await expect(db.query("update trips set destination = 'Goa', destination_lat = 95, destination_lon = 10 where id = $1", [id.trip])).rejects.toThrow();
    await expect(db.query("update trips set destination = '  ', destination_lat = 10, destination_lon = 10 where id = $1", [id.trip])).rejects.toThrow();
  });

  it("only the organizer can change it", async () => {
    const set = "update trips set destination = 'Goa, India', destination_lat = 15.49, destination_lon = 73.83 where id = $1 returning id";
    expect(await changed(id.alice, set, [id.trip])).toBe(0);
    expect(await changed(id.organizer, set, [id.trip])).toBe(1);
    const trip = await db.query("select destination from trips where id = $1", [id.trip]);
    expect(trip.rows).toEqual([{ destination: "Goa, India" }]);
  });
});
