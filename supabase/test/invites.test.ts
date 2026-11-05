import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, id, seededDb, visibleIds } from "./helpers";

let db: PGlite;
beforeEach(async () => {
  db = await seededDb();
});

type Invite = { id: string; token: string };
type Redeemed = { trip_id: string; status: string };

async function createInvite(user: string, trip: string = id.trip): Promise<Invite> {
  return asUser(db, user, async (tx) => (await tx.query<{ r: Invite }>("select create_invite($1) as r", [trip])).rows[0]!.r);
}
async function redeem(user: string, token: string): Promise<Redeemed> {
  return asUser(db, user, async (tx) => (await tx.query<{ r: Redeemed }>("select redeem_invite($1) as r", [token])).rows[0]!.r);
}
async function statusOf(user: string, trip: string = id.trip): Promise<string | undefined> {
  const r = await db.query<{ status: string }>("select status from members where trip_id = $1 and user_id = $2", [trip, user]);
  return r.rows[0]?.status;
}
const call = (user: string, sql: string, params: unknown[] = []) => asUser(db, user, (tx) => tx.query(sql, params));

describe("create_invite and revoke_invite", () => {
  it("the organizer gets a long, unguessable, single-trip token", async () => {
    const a = await createInvite(id.organizer);
    const b = await createInvite(id.organizer);
    expect(a.token).toMatch(/^[0-9a-f]{64}$/);
    expect(a.token).not.toBe(b.token);
    const row = await db.query<{ trip_id: string }>("select trip_id from invites where id = $1", [a.id]);
    expect(row.rows[0]?.trip_id).toBe(id.trip);
  });

  it("only the organizer of that trip can create invites", async () => {
    for (const user of [id.alice, id.editor, id.pending, id.removed, id.outsider, id.otherOrganizer]) {
      await expect(createInvite(user), user).rejects.toThrow();
    }
  });

  it("the organizer can revoke an invite and then nobody can redeem it", async () => {
    const inv = await createInvite(id.organizer);
    await call(id.organizer, "select revoke_invite($1)", [inv.id]);
    await expect(redeem(id.outsider, inv.token)).rejects.toThrow(/invalid or expired/);
  });

  it("other people cannot revoke an invite", async () => {
    const inv = await createInvite(id.organizer);
    for (const user of [id.alice, id.otherOrganizer, id.outsider]) {
      await expect(call(user, "select revoke_invite($1)", [inv.id]), user).rejects.toThrow();
    }
    await expect(redeem(id.outsider, inv.token)).resolves.toBeDefined();
  });

  it("invite tokens are not readable by regular members, only by the trip's organizer", async () => {
    await createInvite(id.organizer);
    expect(await visibleIds(db, id.alice, "invites")).toEqual([]);
    expect(await visibleIds(db, id.otherOrganizer, "invites")).toEqual([]);
    expect(await visibleIds(db, id.organizer, "invites")).toHaveLength(1);
  });
});

describe("redeem_invite", () => {
  it("creates a pending member in the invite's trip only", async () => {
    const inv = await createInvite(id.organizer);
    expect(await redeem(id.outsider, inv.token)).toEqual({ trip_id: id.trip, status: "pending" });
    expect(await statusOf(id.outsider)).toBe("pending");
    expect(await statusOf(id.outsider, id.otherTrip)).toBeUndefined();
  });

  it("a pending member sees no trip data", async () => {
    const inv = await createInvite(id.organizer);
    await redeem(id.outsider, inv.token);
    for (const table of ["trips", "items", "documents", "change_log"]) {
      expect(await visibleIds(db, id.outsider, table), table).toEqual([]);
    }
  });

  it("redeeming twice is harmless", async () => {
    const inv = await createInvite(id.organizer);
    await redeem(id.outsider, inv.token);
    expect((await redeem(id.outsider, inv.token)).status).toBe("pending");
    const count = await db.query<{ n: number }>("select count(*)::int as n from members where user_id = $1", [id.outsider]);
    expect(count.rows[0]?.n).toBe(1);
  });

  it("does not demote or change someone who is already a member", async () => {
    const inv = await createInvite(id.organizer);
    expect((await redeem(id.alice, inv.token)).status).toBe("approved");
    expect((await redeem(id.organizer, inv.token)).status).toBe("approved");
    expect(await statusOf(id.organizer)).toBe("approved");
  });

  it("a removed member cannot get back in with the link", async () => {
    const inv = await createInvite(id.organizer);
    expect((await redeem(id.removed, inv.token)).status).toBe("removed");
    expect(await visibleIds(db, id.removed, "items")).toEqual([]);
  });

  it("rejects an unknown token and an expired invite", async () => {
    await expect(redeem(id.outsider, "f".repeat(64))).rejects.toThrow(/invalid or expired/);
    const inv = await createInvite(id.organizer);
    await db.query("update invites set expires_at = now() - interval '1 minute' where id = $1", [inv.id]);
    await expect(redeem(id.outsider, inv.token)).rejects.toThrow(/invalid or expired/);
  });

  it("invites expire after 14 days by default", async () => {
    const inv = await createInvite(id.organizer);
    const r = await db.query<{ days: number }>(
      "select round(extract(epoch from (expires_at - created_at)) / 86400)::int as days from invites where id = $1",
      [inv.id],
    );
    expect(r.rows[0]?.days).toBe(14);
  });
});

describe("approve_member and remove_member", () => {
  it("only the organizer can approve", async () => {
    for (const user of [id.alice, id.editor, id.pending, id.outsider, id.otherOrganizer]) {
      await expect(call(user, "select approve_member($1, $2)", [id.trip, id.pending]), user).rejects.toThrow();
    }
    expect(await statusOf(id.pending)).toBe("pending");
    await call(id.organizer, "select approve_member($1, $2)", [id.trip, id.pending]);
    expect(await statusOf(id.pending)).toBe("approved");
  });

  it("an approved member can then see the trip", async () => {
    await call(id.organizer, "select approve_member($1, $2)", [id.trip, id.pending]);
    expect(await visibleIds(db, id.pending, "trips")).toEqual([id.trip]);
    expect(await visibleIds(db, id.pending, "items")).not.toEqual([]);
  });

  it("approving someone who is not in the trip fails", async () => {
    await expect(call(id.organizer, "select approve_member($1, $2)", [id.trip, id.outsider])).rejects.toThrow(/not found/);
  });

  it("a removed member can be let back in by the organizer", async () => {
    await call(id.organizer, "select approve_member($1, $2)", [id.trip, id.removed]);
    expect(await statusOf(id.removed)).toBe("approved");
  });

  it("removing a member ends their read access at once", async () => {
    expect(await visibleIds(db, id.alice, "items")).not.toEqual([]);
    await call(id.organizer, "select remove_member($1, $2)", [id.trip, id.alice]);
    expect(await statusOf(id.alice)).toBe("removed");
    expect(await visibleIds(db, id.alice, "items")).toEqual([]);
    expect(await visibleIds(db, id.alice, "documents")).toEqual([]);
  });

  it("only the organizer can remove, and an organizer cannot be removed", async () => {
    await expect(call(id.alice, "select remove_member($1, $2)", [id.trip, id.bob])).rejects.toThrow();
    await expect(call(id.organizer, "select remove_member($1, $2)", [id.trip, id.organizer])).rejects.toThrow(/organizer/);
    expect(await statusOf(id.organizer)).toBe("approved");
  });
});

describe("profiles", () => {
  it("signing up creates a profile from the name given", async () => {
    const uid = "00000000-0000-0000-0000-0000000000f1";
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, 'neha@example.com', '{\"display_name\": \"Neha\"}')", [uid]);
    const r = await db.query<{ display_name: string }>("select display_name from profiles where user_id = $1", [uid]);
    expect(r.rows[0]?.display_name).toBe("Neha");
  });

  it("falls back to the start of the email when no name was given", async () => {
    const uid = "00000000-0000-0000-0000-0000000000f2";
    await db.query("insert into auth.users (id, email) values ($1, 'kabir@example.com')", [uid]);
    const r = await db.query<{ display_name: string }>("select display_name from profiles where user_id = $1", [uid]);
    expect(r.rows[0]?.display_name).toBe("kabir");
  });

  it("people can read and edit their own profile only", async () => {
    const own = await call(id.alice, "select display_name from profiles where user_id = $1", [id.alice]);
    expect(own.rows).toHaveLength(1);
    const edited = await call(id.alice, "update profiles set display_name = 'Alice B' where user_id = $1 returning 1", [id.alice]);
    expect(edited.rows).toHaveLength(1);
    const other = await call(id.alice, "update profiles set display_name = 'Hacked' where user_id = $1 returning 1", [id.bob]);
    expect(other.rows).toHaveLength(0);
  });

  it("members can read the names of people in their trips, including pending ones, and nobody else's", async () => {
    const names = async (user: string) =>
      (await call(user, "select user_id from profiles order by user_id")).rows.map((r) => (r as { user_id: string }).user_id);
    const bobSees = await names(id.bob);
    expect(bobSees).toContain(id.pending);
    expect(bobSees).toContain(id.organizer);
    expect(bobSees).not.toContain(id.otherOrganizer);
    expect(await names(id.outsider)).toEqual([id.outsider]);
    expect(await names(id.pending)).toEqual([id.pending]);
  });
});

describe("old invites tidy themselves away", () => {
  const old = (days: number) => `now() - interval '${days} days'`;
  async function insertInvite(trip: string, createdDaysAgo: number, expiresDaysAhead: number, revokedDaysAgo: number | null): Promise<string> {
    const r = await db.query<{ id: string }>(
      `insert into invites (trip_id, created_by, created_at, expires_at, revoked_at)
       values ($1, $2, ${old(createdDaysAgo)}, now() + interval '${expiresDaysAhead} days', ${revokedDaysAgo === null ? "null" : old(revokedDaysAgo)}) returning id`,
      [trip, id.organizer],
    );
    return r.rows[0]!.id;
  }
  const remaining = async () => (await db.query<{ id: string }>("select id from invites")).rows.map((row) => row.id);

  it("a new invite removes this trip's invites that were revoked or expired over 30 days ago, and nothing else", async () => {
    const revokedLongAgo = await insertInvite(id.trip, 60, 14, 45);
    const expiredLongAgo = await insertInvite(id.trip, 90, -40, null);
    const revokedRecently = await insertInvite(id.trip, 5, 14, 2);
    const activeOne = await insertInvite(id.trip, 1, 14, null);
    const expiredRecently = await insertInvite(id.trip, 20, -3, null);
    const otherTripOld = await insertInvite(id.otherTrip, 60, 14, 45);
    const fresh = await createInvite(id.organizer);
    const left = await remaining();
    expect(left).not.toContain(revokedLongAgo);
    expect(left).not.toContain(expiredLongAgo);
    for (const keep of [revokedRecently, activeOne, expiredRecently, otherTripOld, fresh.id]) expect(left).toContain(keep);
  });

  it("an active invite is never removed, however old it is", async () => {
    const stillActive = await insertInvite(id.trip, 400, 14, null);
    await createInvite(id.organizer);
    expect(await remaining()).toContain(stillActive);
  });

  it("purge_old_invites removes the same old ones for every trip and says how many", async () => {
    await insertInvite(id.trip, 60, 14, 45);
    await insertInvite(id.otherTrip, 60, 14, 50);
    const keep = await insertInvite(id.trip, 1, 14, null);
    const result = await db.query<{ n: number }>("select purge_old_invites() as n");
    expect(result.rows[0]?.n).toBe(2);
    expect(await remaining()).toEqual([keep]);
  });

  it("app users cannot run purge_old_invites", async () => {
    for (const user of [id.organizer, id.alice, id.outsider]) {
      await expect(call(user, "select purge_old_invites()"), user).rejects.toThrow();
    }
  });
});
