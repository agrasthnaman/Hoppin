import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, id, path, seededDb, visibleIds } from "./helpers";

let db: PGlite;
beforeEach(async () => {
  db = await seededDb();
});

const call = (user: string, sql: string, params: unknown[] = []) => asUser(db, user, (tx) => tx.query(sql, params));
const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const statusOf = async (user: string, trip: string = id.trip) =>
  (await one<{ status: string }>("select status from members where trip_id = $1 and user_id = $2", [trip, user]))[0]?.status;
const makeOrganizer = (user: string) => call(id.organizer, "select set_member_role($1, $2, 'organizer')", [id.trip, user]);

describe("set_member_role", () => {
  it("lets an organizer make a member an organizer, who can then approve people", async () => {
    await makeOrganizer(id.alice);
    const role = await one<{ role: string }>("select role from members where trip_id = $1 and user_id = $2", [id.trip, id.alice]);
    expect(role[0]?.role).toBe("organizer");
    await call(id.alice, "select approve_member($1, $2)", [id.trip, id.pending]);
    expect(await statusOf(id.pending)).toBe("approved");
  });

  it("only an organizer can change roles", async () => {
    for (const user of [id.alice, id.editor, id.pending, id.outsider, id.otherOrganizer]) {
      await expect(call(user, "select set_member_role($1, $2, 'organizer')", [id.trip, id.bob]), user).rejects.toThrow();
    }
  });

  it("only approved members can be made organizers", async () => {
    await expect(call(id.organizer, "select set_member_role($1, $2, 'organizer')", [id.trip, id.pending])).rejects.toThrow(/approved/);
    await expect(call(id.organizer, "select set_member_role($1, $2, 'organizer')", [id.trip, id.outsider])).rejects.toThrow();
  });

  it("rejects a role that does not exist", async () => {
    await expect(call(id.organizer, "select set_member_role($1, $2, 'owner')", [id.trip, id.alice])).rejects.toThrow();
  });

  it("the last organizer cannot be demoted, but one of two can", async () => {
    await expect(call(id.organizer, "select set_member_role($1, $2, 'member')", [id.trip, id.organizer])).rejects.toThrow(/only organizer/i);
    await makeOrganizer(id.alice);
    await call(id.alice, "select set_member_role($1, $2, 'member')", [id.trip, id.organizer]);
    expect((await one<{ role: string }>("select role from members where trip_id = $1 and user_id = $2", [id.trip, id.organizer]))[0]?.role).toBe("member");
  });
});

describe("leave_trip", () => {
  it("a member leaves: they are out, their private plans and personal documents go, shared plans stay", async () => {
    await call(id.alice, "select leave_trip($1)", [id.trip]);
    expect(await statusOf(id.alice)).toBeUndefined();
    expect(await visibleIds(db, id.bob, "items")).toContain(id.aliceOptional);
    const gone = await one<{ n: number }>("select count(*)::int as n from items where id = $1", [id.alicePrivate]);
    expect(gone[0]?.n).toBe(0);
    const docs = await one<{ n: number }>("select count(*)::int as n from documents where id = $1", [id.alicePassport]);
    expect(docs[0]?.n).toBe(0);
    expect(await visibleIds(db, id.alice, "trips")).toEqual([]);
  });

  it("their replies to plans are withdrawn", async () => {
    await call(id.alice, "insert into rsvps (item_id, user_id) values ($1, $2)", [id.stay, id.alice]);
    await call(id.alice, "select leave_trip($1)", [id.trip]);
    expect((await one<{ n: number }>("select count(*)::int as n from rsvps where user_id = $1", [id.alice]))[0]?.n).toBe(0);
  });

  it("someone who leaves can join again with an invite link", async () => {
    await call(id.alice, "select leave_trip($1)", [id.trip]);
    const invite = (await call(id.organizer, "select create_invite($1) as r", [id.trip])).rows[0] as { r: { token: string } };
    const again = (await call(id.alice, "select redeem_invite($1) as r", [invite.r.token])).rows[0] as { r: { status: string } };
    expect(again.r.status).toBe("pending");
  });

  it("someone waiting for approval can withdraw", async () => {
    await call(id.pending, "select leave_trip($1)", [id.trip]);
    expect(await statusOf(id.pending)).toBeUndefined();
  });

  it("a removed member cannot use it to get around being removed", async () => {
    await expect(call(id.removed, "select leave_trip($1)", [id.trip])).rejects.toThrow();
    expect(await statusOf(id.removed)).toBe("removed");
  });

  it("people who are not in the trip cannot leave it", async () => {
    await expect(call(id.outsider, "select leave_trip($1)", [id.trip])).rejects.toThrow(/not a member/);
  });

  it("the only organizer cannot leave, but can once someone else is an organizer", async () => {
    await expect(call(id.organizer, "select leave_trip($1)", [id.trip])).rejects.toThrow(/only organizer/i);
    await makeOrganizer(id.alice);
    await call(id.organizer, "select leave_trip($1)", [id.trip]);
    expect(await statusOf(id.organizer)).toBeUndefined();
  });
});

describe("delete_my_account", () => {
  const userExists = async (user: string) => (await one<{ n: number }>("select count(*)::int as n from auth.users where id = $1", [user]))[0]?.n === 1;

  it("removes the person; private plans and personal documents are deleted; the trip carries on for everyone else", async () => {
    await call(id.alice, "select delete_my_account()");
    expect(await userExists(id.alice)).toBe(false);
    expect((await one<{ n: number }>("select count(*)::int as n from profiles where user_id = $1", [id.alice]))[0]?.n).toBe(0);
    expect((await one<{ n: number }>("select count(*)::int as n from items where id = $1", [id.alicePrivate]))[0]?.n).toBe(0);
    expect((await one<{ n: number }>("select count(*)::int as n from documents where id = $1", [id.alicePassport]))[0]?.n).toBe(0);
    expect(await visibleIds(db, id.bob, "trips")).toEqual([id.trip]);
    expect(await visibleIds(db, id.bob, "documents", { column: "id", value: id.bobPassport })).toEqual([id.bobPassport]);
  });

  it("plans and documents shared with the group are handed to an organizer, so the booking survives", async () => {
    await call(id.alice, "select delete_my_account()");
    const owner = await one<{ owner_id: string }>("select owner_id from items where id = $1", [id.aliceOptional]);
    expect(owner[0]?.owner_id).toBe(id.organizer);
    expect(await visibleIds(db, id.bob, "items", { column: "id", value: id.aliceOptional })).toEqual([id.aliceOptional]);
  });

  it("an organizer who is the only organizer of a trip with other people is refused, and nothing changes", async () => {
    await expect(call(id.organizer, "select delete_my_account()")).rejects.toThrow(/only organizer of "Goa"/);
    expect(await userExists(id.organizer)).toBe(true);
    expect(await statusOf(id.organizer)).toBe("approved");
  });

  it("a co-organizer can delete their account, and the trip passes to the other organizer", async () => {
    await makeOrganizer(id.alice);
    await call(id.organizer, "select delete_my_account()");
    expect(await userExists(id.organizer)).toBe(false);
    const trip = await one<{ created_by: string }>("select created_by from trips where id = $1", [id.trip]);
    expect(trip[0]?.created_by).toBe(id.alice);
    const stay = await one<{ owner_id: string }>("select owner_id from items where id = $1", [id.stay]);
    expect(stay[0]?.owner_id).toBe(id.alice);
    const ticket = await one<{ owner_id: string }>("select owner_id from documents where id = $1", [id.ticketDoc]);
    expect(ticket[0]?.owner_id).toBe(id.alice);
  });

  it("a trip with nobody else in it is deleted with the account", async () => {
    await call(id.otherOrganizer, "select delete_my_account()");
    expect(await userExists(id.otherOrganizer)).toBe(false);
    expect((await one<{ n: number }>("select count(*)::int as n from trips where id = $1", [id.otherTrip]))[0]?.n).toBe(0);
  });

  it("their invite links go with them", async () => {
    await makeOrganizer(id.alice);
    await call(id.organizer, "select create_invite($1)", [id.trip]);
    await call(id.organizer, "select delete_my_account()");
    expect((await one<{ n: number }>("select count(*)::int as n from invites", []))[0]?.n).toBe(0);
  });

  it("someone with no trips can delete their account", async () => {
    await call(id.outsider, "select delete_my_account()");
    expect(await userExists(id.outsider)).toBe(false);
  });

  it("people who were removed or are still waiting do not keep any data behind", async () => {
    await call(id.removed, "select delete_my_account()");
    await call(id.pending, "select delete_my_account()");
    expect(await userExists(id.removed)).toBe(false);
    expect(await userExists(id.pending)).toBe(false);
  });
});

describe("the history of private plans", () => {
  const history = async (owner: string, visibility: string) =>
    (await one<{ n: number }>("select count(*)::int as n from change_log where item_owner_id = $1 and item_visibility = $2", [owner, visibility]))[0]!.n;
  beforeEach(async () => {
    await call(id.alice, "update items set title = 'ABC place (moved)' where id = $1", [id.alicePrivate]);
    await call(id.alice, "update items set title = 'Museum (new)' where id = $1", [id.aliceOptional]);
    await call(id.bob, "insert into items (trip_id, owner_id, kind, visibility, starts_at, tz, title) values ($1, $2, 'plan', 'private', now(), 'UTC', 'Bob only')", [id.trip, id.bob]);
  });

  it("goes when the person leaves the trip; their shared plans' history and other people's stay", async () => {
    expect(await history(id.alice, "private")).toBeGreaterThan(0);
    await call(id.alice, "select leave_trip($1)", [id.trip]);
    expect(await history(id.alice, "private")).toBe(0);
    expect(await history(id.alice, "shared")).toBeGreaterThan(0);
    expect(await history(id.bob, "private")).toBeGreaterThan(0);
  });

  it("goes when the person deletes their account", async () => {
    await call(id.alice, "select delete_my_account()");
    expect(await history(id.alice, "private")).toBe(0);
    expect(await history(id.bob, "private")).toBeGreaterThan(0);
  });

  it("stays for someone who was removed (they may be let back in)", async () => {
    await call(id.organizer, "select remove_member($1, $2)", [id.trip, id.alice]);
    expect(await history(id.alice, "private")).toBeGreaterThan(0);
  });
});

describe("files that go with an account", () => {
  const files = async (user: string) => (await call(user, "select f from my_account_files() as f")).rows.map((r) => (r as { f: string }).f).sort();
  const store = (name: string, owner: string) => db.exec(`insert into storage.objects (bucket_id, name, owner) values ('trip-documents', '${name}', '${owner}')`);
  const removeFile = async (user: string, name: string) => (await call(user, "delete from storage.objects where name = $1 returning 1", [name])).rows.length;
  const stored = async () => (await one<{ name: string }>("select name from storage.objects order by name")).map((r) => r.name);
  /** What the app does: remove the listed files, then delete the account. */
  async function deleteAccount(user: string) {
    for (const name of await files(user)) await removeFile(user, name);
    await call(user, "select delete_my_account()");
  }

  beforeEach(async () => {
    await store(path.alicePassport, id.alice);
    await store(path.bobPassport, id.bob);
    await store(path.ticket, id.organizer);
  });

  it("include personal documents in a trip the person was removed from, and they can delete them", async () => {
    await call(id.organizer, "select remove_member($1, $2)", [id.trip, id.alice]);
    expect(await files(id.alice)).toEqual([path.alicePassport]);
    await deleteAccount(id.alice);
    expect(await stored()).toEqual([path.bobPassport, path.ticket].sort());
  });

  it("include every document of a trip deleted with the account", async () => {
    const lodge = `${id.otherTrip}/${id.otherOrganizer}/d1-lodge.pdf`;
    await db.exec(`insert into documents (trip_id, owner_id, scope, storage_path, kind) values ('${id.otherTrip}', '${id.otherOrganizer}', 'shared', '${lodge}', 'ticket')`);
    await store(lodge, id.otherOrganizer);
    expect(await files(id.otherOrganizer)).toEqual([lodge]);
    await deleteAccount(id.otherOrganizer);
    expect(await stored()).not.toContain(lodge);
  });

  it("leave other people's files and the documents handed to the group alone", async () => {
    await makeOrganizer(id.alice);
    expect(await files(id.organizer)).toEqual([]); // the ticket is shared and the trip carries on
    expect(await files(id.alice)).toEqual([path.alicePassport]);
    for (const user of [id.bob, id.outsider]) expect(await files(user), user).not.toContain(path.alicePassport);
  });

  it("a removed member still cannot delete a shared file they uploaded, or anyone else's", async () => {
    const shared = `${id.trip}/${id.alice}/d2-tickets.pdf`;
    await db.exec(`insert into documents (trip_id, owner_id, scope, storage_path, kind) values ('${id.trip}', '${id.alice}', 'shared', '${shared}', 'ticket')`);
    await store(shared, id.alice);
    await call(id.organizer, "select remove_member($1, $2)", [id.trip, id.alice]);
    expect(await removeFile(id.alice, shared)).toBe(0);
    expect(await removeFile(id.alice, path.bobPassport)).toBe(0);
  });
});

describe("ownership of an item", () => {
  it("still cannot be changed by ordinary people, even editors", async () => {
    await expect(call(id.editor, "update items set owner_id = $1 where id = $2", [id.editor, id.aliceOptional])).rejects.toThrow();
    await expect(call(id.organizer, "update items set owner_id = $1 where id = $2", [id.organizer, id.aliceOptional])).rejects.toThrow();
  });
});

describe("storage: deleting a whole trip", () => {
  beforeEach(async () => {
    // a file always has a document record (that is what lets people see it)
    await db.exec(`insert into storage.objects (bucket_id, name, owner) values
      ('trip-documents', '${id.trip}/${id.alice}/x-passport.pdf', '${id.alice}');
      insert into documents (trip_id, owner_id, scope, storage_path, kind) values
      ('${id.trip}', '${id.alice}', 'shared', '${id.trip}/${id.alice}/x-passport.pdf', 'ticket')`);
  });
  const remove = async (user: string) =>
    (await call(user, "delete from storage.objects where name = $1 returning 1", [`${id.trip}/${id.alice}/x-passport.pdf`])).rows.length;

  it("the organizer can delete every file of their trip, whoever uploaded it", async () => {
    expect(await remove(id.organizer)).toBe(1);
  });

  it("other members cannot delete someone else's file, and outsiders and other trips' organizers cannot either", async () => {
    for (const user of [id.bob, id.editor, id.outsider, id.otherOrganizer]) expect(await remove(user), user).toBe(0);
  });
});

describe("my_account_blockers", () => {
  const blockers = async (user: string) => (await call(user, "select name from my_account_blockers() as name")).rows.map((r) => (r as { name: string }).name);

  it("lists the trips that stop an account from being deleted (only organizer, other people inside)", async () => {
    expect(await blockers(id.organizer)).toEqual(["Goa"]);
  });

  it("is empty for members, for people with nothing in the way, and once someone else is an organizer", async () => {
    expect(await blockers(id.alice)).toEqual([]);
    expect(await blockers(id.outsider)).toEqual([]);
    expect(await blockers(id.otherOrganizer)).toEqual([]); // alone in their trip: it is deleted with them
    await makeOrganizer(id.alice);
    expect(await blockers(id.organizer)).toEqual([]);
  });
});
