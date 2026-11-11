import type { PGlite, Transaction } from "@electric-sql/pglite";
import { makeTestDb } from "./pglite";

export const id = {
  organizer: "00000000-0000-0000-0000-000000000001",
  alice: "00000000-0000-0000-0000-000000000002", // approved member
  bob: "00000000-0000-0000-0000-000000000003", // approved member
  pending: "00000000-0000-0000-0000-000000000004",
  removed: "00000000-0000-0000-0000-000000000005",
  outsider: "00000000-0000-0000-0000-000000000006", // not in the trip
  editor: "00000000-0000-0000-0000-000000000007", // approved member with can_edit_all
  otherOrganizer: "00000000-0000-0000-0000-000000000008", // organizer of the second trip
  trip: "00000000-0000-0000-0000-0000000000a1",
  otherTrip: "00000000-0000-0000-0000-0000000000a2",
  stay: "00000000-0000-0000-0000-0000000000b1", // shared group item by organizer
  alicePrivate: "00000000-0000-0000-0000-0000000000b2", // private item by alice
  aliceOptional: "00000000-0000-0000-0000-0000000000b3", // shared optional item by alice
  otherTripItem: "00000000-0000-0000-0000-0000000000b4",
  ticketDoc: "00000000-0000-0000-0000-0000000000c1", // shared document
  alicePassport: "00000000-0000-0000-0000-0000000000c2", // personal document
  bobPassport: "00000000-0000-0000-0000-0000000000c3", // personal document
} as const;

/** Where the seeded documents' files live: <trip>/<uploader>/<document id>-<file name>, as the app writes them. */
export const path = {
  ticket: `${id.trip}/${id.organizer}/${id.ticketDoc}-ticket.pdf`,
  alicePassport: `${id.trip}/${id.alice}/${id.alicePassport}-passport.pdf`,
  bobPassport: `${id.trip}/${id.bob}/${id.bobPassport}-passport.pdf`,
} as const;

const SEED = `
insert into auth.users (id) values
  ('${id.organizer}'), ('${id.alice}'), ('${id.bob}'), ('${id.pending}'),
  ('${id.removed}'), ('${id.outsider}'), ('${id.editor}'), ('${id.otherOrganizer}');

insert into trips (id, name, created_by) values
  ('${id.trip}', 'Goa', '${id.organizer}'),
  ('${id.otherTrip}', 'Manali', '${id.otherOrganizer}');

insert into members (trip_id, user_id, role, status, can_edit_all) values
  ('${id.trip}', '${id.organizer}', 'organizer', 'approved', false),
  ('${id.trip}', '${id.alice}', 'member', 'approved', false),
  ('${id.trip}', '${id.bob}', 'member', 'approved', false),
  ('${id.trip}', '${id.pending}', 'member', 'pending', false),
  ('${id.trip}', '${id.removed}', 'member', 'removed', false),
  ('${id.trip}', '${id.editor}', 'member', 'approved', true),
  ('${id.otherTrip}', '${id.otherOrganizer}', 'organizer', 'approved', false);

insert into items (id, trip_id, owner_id, kind, visibility, group_item, starts_at, tz, title) values
  ('${id.stay}', '${id.trip}', '${id.organizer}', 'stay', 'shared', true, '2026-12-01T10:00:00Z', 'Asia/Kolkata', 'Beach hotel'),
  ('${id.alicePrivate}', '${id.trip}', '${id.alice}', 'plan', 'private', false, '2026-12-02T15:00:00Z', 'Asia/Kolkata', 'ABC place'),
  ('${id.aliceOptional}', '${id.trip}', '${id.alice}', 'activity', 'shared', false, '2026-12-02T10:30:00Z', 'Asia/Kolkata', 'Museum'),
  ('${id.otherTripItem}', '${id.otherTrip}', '${id.otherOrganizer}', 'stay', 'shared', true, '2026-12-05T10:00:00Z', 'Asia/Kolkata', 'Mountain lodge');

insert into documents (id, trip_id, item_id, owner_id, scope, storage_path, kind) values
  ('${id.ticketDoc}', '${id.trip}', '${id.stay}', '${id.organizer}', 'shared', '${path.ticket}', 'ticket'),
  ('${id.alicePassport}', '${id.trip}', null, '${id.alice}', 'personal', '${path.alicePassport}', 'passport'),
  ('${id.bobPassport}', '${id.trip}', null, '${id.bob}', 'personal', '${path.bobPassport}', 'passport');
`;

/** A fresh database with the schema and a small seeded trip (runs as superuser, so seeding skips the privacy rules). */
export async function seededDb(): Promise<PGlite> {
  const db = await makeTestDb();
  await db.exec(SEED);
  return db;
}

/** Runs `fn` as a signed-in user (role `authenticated`, auth.uid() = userId) in one transaction. */
export async function asUser<T>(db: PGlite, userId: string, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    return fn(tx);
  });
}

/** Ids of the rows a user can see in a table, optionally filtered by a column value. */
export async function visibleIds(
  db: PGlite,
  userId: string,
  table: string,
  where?: { column: string; value: string },
): Promise<string[]> {
  return asUser(db, userId, async (tx) => {
    const sql = where
      ? `select id::text as id from ${table} where ${where.column} = $1 order by id`
      : `select id::text as id from ${table} order by id`;
    const result = await tx.query<{ id: string }>(sql, where ? [where.value] : []);
    return result.rows.map((r) => r.id);
  });
}
