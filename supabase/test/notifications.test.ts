import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, id, seededDb } from "./helpers";

let db: PGlite;
beforeEach(async () => {
  db = await seededDb();
  await db.exec(`
    update auth.users set email = id::text || '@example.com';
    update digest_queue set through_id = (select max(id) from change_log), pending_since = null; -- the seed is old history
  `);
});

type Batch = {
  trip_id: string;
  trip_name: string;
  through_id: number;
  entries: { id: number; item_id: string; actor_id: string | null; op: string; item_visibility: string }[];
  recipients: { user_id: string; email: string | null; display_name: string | null }[];
};

const asService = async <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return (await tx.query<T>(sql, params)).rows;
  });
const claim = async (windowSeconds = 300) => (await asService<{ b: Batch[] }>("select claim_digest_batch($1, 20, 500) as b", [windowSeconds]))[0]!.b;
const record = async (trip: string, from: number, through: number, rows: unknown[]) =>
  (
    await asService<{ ok: boolean }>("select record_digests($1, $2, $3, '2026-12-01T08:00:00Z', $4::jsonb) as ok", [trip, from, through, JSON.stringify(rows)])
  )[0]!.ok;
const editStay = (title: string) => asUser(db, id.organizer, (tx) => tx.query("update items set title = $1 where id = $2", [title, id.stay]));
/** Moves the trip's pending changes back in time, as if the window had passed. */
const age = (minutes: number) =>
  db.exec(`
    update change_log set changed_at = changed_at - interval '${minutes} minutes';
    update digest_queue set pending_since = pending_since - interval '${minutes} minutes';
  `);
const queue = async () => (await db.query<{ trip_id: string; through_id: number; pending: boolean }>("select trip_id, through_id, pending_since is not null as pending from digest_queue")).rows;

describe("collecting changes", () => {
  it("an item change marks the trip as waiting, once, however many changes follow", async () => {
    await editStay("A");
    await editStay("B");
    const rows = (await queue()).filter((r) => r.trip_id === id.trip);
    expect(rows).toEqual([{ trip_id: id.trip, through_id: expect.any(Number), pending: true }]);
  });

  it("nothing is handed out until the window has passed", async () => {
    await editStay("A");
    expect(await claim()).toEqual([]);
    await age(6);
    const [batch] = await claim();
    expect(batch!.trip_id).toBe(id.trip);
    expect(batch!.trip_name).toBe("Goa");
    expect(batch!.entries.at(-1)).toMatchObject({ item_id: id.stay, actor_id: id.organizer, op: "update", item_visibility: "shared" });
  });

  it("recipients are the approved members only, with no email for those who turned it off", async () => {
    await asUser(db, id.alice, (tx) => tx.query("select set_email_digest($1, true)", [id.trip]));
    await editStay("A");
    await age(6);
    const [batch] = await claim();
    const people = Object.fromEntries(batch!.recipients.map((r) => [r.user_id, r.email]));
    expect(Object.keys(people).sort()).toEqual([id.organizer, id.alice, id.bob, id.editor].sort());
    expect(people[id.bob]).toBeNull();
    expect(people[id.alice]).toBe(`${id.alice}@example.com`);
  });
});

describe("recording digests", () => {
  it("saves each person's digest, moves the trip on, and a second run with the same batch does nothing", async () => {
    await editStay("A");
    await age(6);
    const [batch] = await claim();
    const last = batch!.entries.at(-1)!.id;
    const rows = [{ user_id: id.alice, changes: [{ itemId: id.stay }] }];
    expect(await record(id.trip, batch!.through_id, last, rows)).toBe(true);
    expect(await record(id.trip, batch!.through_id, last, rows)).toBe(false);
    expect((await db.query("select user_id from notifications")).rows).toEqual([{ user_id: id.alice }]);
    expect((await queue()).find((r) => r.trip_id === id.trip)).toMatchObject({ through_id: last, pending: false });
    expect(await claim()).toEqual([]);
  });

  it("changes after the batch keep the trip waiting", async () => {
    await editStay("A");
    await age(6);
    const [batch] = await claim();
    await editStay("B");
    await record(id.trip, batch!.through_id, batch!.entries.at(-1)!.id, []);
    expect((await queue()).find((r) => r.trip_id === id.trip)!.pending).toBe(true);
  });

  it("people who are not approved members of the trip are never given a digest", async () => {
    await editStay("A");
    await age(6);
    const [batch] = await claim();
    await record(id.trip, batch!.through_id, batch!.entries.at(-1)!.id, [
      { user_id: id.outsider, changes: [] },
      { user_id: id.removed, changes: [] },
      { user_id: id.bob, changes: [] },
    ]);
    expect((await db.query("select user_id from notifications")).rows).toEqual([{ user_id: id.bob }]);
  });

  it("only the scheduled job can claim and record", async () => {
    for (const sql of ["select claim_digest_batch(300, 20, 500)", `select record_digests('${id.trip}', 0, 1, now(), '[]')`]) {
      await expect(asUser(db, id.organizer, (tx) => tx.query(sql))).rejects.toThrow(/permission denied/);
    }
    await expect(asUser(db, id.organizer, (tx) => tx.query("select * from digest_queue"))).rejects.toThrow(/permission denied/);
  });
});

describe("a trip whose digest could not be made", () => {
  const claimOne = async () => (await asService<{ b: Batch[] }>("select claim_digest_batch(300, 1, 500) as b"))[0]!.b.map((b) => b.trip_id);
  const defer = (trip: string, from: number) => asService("select defer_digest($1, $2)", [trip, from]);
  const retry = async (trip: string) =>
    (
      await db.query<{ failures: number; minutes: number | null }>(
        "select failures, round(extract(epoch from retry_at - now()) / 60)::int as minutes from digest_queue where trip_id = $1",
        [trip],
      )
    ).rows[0]!;
  /** Both trips waiting, Goa's changes the oldest, so Goa is first in line. */
  async function twoWaiting() {
    await editStay("A");
    await age(10);
    await asUser(db, id.otherOrganizer, (tx) => tx.query("update items set title = 'Lodge' where id = $1", [id.otherTripItem]));
    await age(6);
  }

  it("steps out of the way, so the trips behind it are handed out", async () => {
    await twoWaiting();
    expect(await claimOne()).toEqual([id.trip]);
    const [goa] = await claim();
    await defer(id.trip, goa!.through_id);
    expect(await claimOne()).toEqual([id.otherTrip]);
  });

  it("is tried again later, waiting twice as long after each failure, at most a day", async () => {
    await twoWaiting();
    const from = (await claim())[0]!.through_id;
    await defer(id.trip, from);
    expect(await retry(id.trip)).toEqual({ failures: 1, minutes: 5 });
    await defer(id.trip, from);
    expect(await retry(id.trip)).toEqual({ failures: 2, minutes: 10 });
    await db.exec(`update digest_queue set failures = 1000 where trip_id = '${id.trip}'`);
    await defer(id.trip, from);
    expect(await retry(id.trip)).toEqual({ failures: 1001, minutes: 24 * 60 });
  });

  it("is handed out again once its time comes, and a success clears the failures", async () => {
    await twoWaiting();
    const goa = (await claim())[0]!;
    await defer(id.trip, goa.through_id);
    await db.exec(`update digest_queue set retry_at = now() - interval '1 second' where trip_id = '${id.trip}'`);
    expect(await claimOne()).toEqual([id.trip]);
    expect(await record(id.trip, goa.through_id, goa.entries.at(-1)!.id, [])).toBe(true);
    expect(await retry(id.trip)).toEqual({ failures: 0, minutes: null });
  });

  it("is not pushed back by a run that lost the race to another run", async () => {
    await twoWaiting();
    const goa = (await claim())[0]!;
    await record(id.trip, goa.through_id, goa.entries.at(-1)!.id, []);
    await defer(id.trip, goa.through_id);
    expect(await retry(id.trip)).toEqual({ failures: 0, minutes: null });
  });

  it("only the scheduled job can push a trip back", async () => {
    await expect(asUser(db, id.organizer, (tx) => tx.query(`select defer_digest('${id.trip}', 0)`))).rejects.toThrow(/permission denied/);
  });
});

describe("reading notifications", () => {
  beforeEach(async () => {
    await db.exec(`
      insert into notifications (trip_id, user_id, window_start, changes) values
        ('${id.trip}', '${id.alice}', now(), '[{"itemId":"x"}]'),
        ('${id.trip}', '${id.bob}', now(), '[]'),
        ('${id.trip}', '${id.removed}', now(), '[]');
    `);
  });

  const mine = (user: string) => asUser(db, user, async (tx) => (await tx.query<{ user_id: string; read_at: string | null }>("select user_id, read_at from notifications")).rows);

  it("each person sees only their own, and only while they are in the trip", async () => {
    expect((await mine(id.alice)).map((r) => r.user_id)).toEqual([id.alice]);
    expect(await mine(id.organizer)).toEqual([]);
    expect(await mine(id.removed)).toEqual([]);
  });

  it("marking as read touches only the caller's own notifications", async () => {
    await asUser(db, id.alice, (tx) => tx.query("select mark_notifications_read($1)", [id.trip]));
    expect((await mine(id.alice))[0]!.read_at).not.toBeNull();
    expect((await mine(id.bob))[0]!.read_at).toBeNull();
  });

  it("nobody can write notifications directly", async () => {
    await expect(
      asUser(db, id.alice, (tx) => tx.query("insert into notifications (trip_id, user_id, window_start, changes) values ($1, $2, now(), '[]')", [id.trip, id.alice])),
    ).rejects.toThrow();
    await expect(asUser(db, id.alice, (tx) => tx.query("update notifications set read_at = now()"))).rejects.toThrow();
  });

  it("email is off until a member turns it on, per person and per trip, and outsiders cannot set it", async () => {
    await asUser(db, id.bob, (tx) => tx.query("select set_email_digest($1, true)", [id.trip]));
    const on = await db.query<{ user_id: string; email_digest: boolean }>("select user_id, email_digest from members where trip_id = $1 and user_id in ($2, $3)", [id.trip, id.alice, id.bob]);
    expect(Object.fromEntries(on.rows.map((r) => [r.user_id, r.email_digest]))).toEqual({ [id.alice]: false, [id.bob]: true });
    await expect(asUser(db, id.outsider, (tx) => tx.query("select set_email_digest($1, false)", [id.trip]))).rejects.toThrow("only members of this trip");
  });
});
