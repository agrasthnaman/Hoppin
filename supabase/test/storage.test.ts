import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, id, path, seededDb } from "./helpers";

let db: PGlite;
const orphan = `${id.trip}/${id.organizer}/d0-orphan.pdf`;
beforeEach(async () => {
  db = await seededDb();
  // The seeded documents point at these files.
  await db.exec(`
    insert into storage.objects (bucket_id, name) values
      ('trip-documents', '${path.ticket}'),
      ('trip-documents', '${path.alicePassport}'),
      ('trip-documents', '${path.bobPassport}'),
      ('trip-documents', '${orphan}');
  `);
});

const upload = (user: string, name: string) =>
  asUser(db, user, (tx) => tx.query("insert into storage.objects (bucket_id, name, owner) values ('trip-documents', $1, $2)", [name, user]));
const readable = async (user: string) =>
  (await asUser(db, user, (tx) => tx.query<{ name: string }>("select name from storage.objects order by name"))).rows.map((r) => r.name);
const remove = async (user: string, name: string) =>
  (await asUser(db, user, (tx) => tx.query("delete from storage.objects where name = $1 returning 1", [name]))).rows.length;
const addRecord = (user: string, trip: string, storagePath: string, scope = "shared") =>
  asUser(db, user, (tx) =>
    tx.query("insert into documents (trip_id, owner_id, scope, storage_path, kind) values ($1, $2, $3, $4, 'other')", [trip, user, scope, storagePath]),
  );
const tripOf = async (user: string) =>
  (await asUser(db, user, (tx) => tx.query<{ t: string }>("select create_trip('Mine') as t"))).rows[0]!.t;

describe("trip-documents bucket", () => {
  it("exists and is private", async () => {
    const r = await db.query<{ public: boolean }>("select public from storage.buckets where id = 'trip-documents'");
    expect(r.rows).toEqual([{ public: false }]);
  });
});

describe("uploading", () => {
  it("approved members can upload into their own folder of their own trip", async () => {
    await expect(upload(id.alice, `${id.trip}/${id.alice}/d9-ticket.pdf`)).resolves.toBeDefined();
  });

  it("nobody can upload into someone else's folder", async () => {
    await expect(upload(id.alice, `${id.trip}/${id.bob}/d9-ticket.pdf`)).rejects.toThrow();
  });

  it("people outside the trip, pending members and removed members cannot upload", async () => {
    for (const user of [id.outsider, id.pending, id.removed]) {
      await expect(upload(user, `${id.trip}/${user}/d9-ticket.pdf`), user).rejects.toThrow();
    }
  });

  it("cannot upload into a trip you are not in, even in your own folder", async () => {
    await expect(upload(id.alice, `${id.otherTrip}/${id.alice}/d9-ticket.pdf`)).rejects.toThrow();
  });

  it("malformed paths are rejected", async () => {
    for (const name of ["ticket.pdf", "not-a-uuid/also-not/ticket.pdf", `${id.trip}/ticket.pdf`]) {
      await expect(upload(id.alice, name), name).rejects.toThrow();
    }
  });
});

describe("reading", () => {
  it("members can open files of shared documents and their own personal ones", async () => {
    expect(await readable(id.alice)).toEqual([path.alicePassport, path.ticket].sort());
    expect(await readable(id.bob)).toEqual([path.bobPassport, path.ticket].sort());
  });

  it("the organizer can also open personal documents", async () => {
    expect(await readable(id.organizer)).toEqual([path.alicePassport, path.bobPassport, path.ticket].sort());
  });

  it("a file with no document record is not readable by anyone", async () => {
    for (const user of [id.organizer, id.alice, id.bob]) {
      expect(await readable(user), user).not.toContain(orphan);
    }
  });

  it("outsiders, pending and removed members can read nothing", async () => {
    for (const user of [id.outsider, id.pending, id.removed]) {
      expect(await readable(user), user).toEqual([]);
    }
  });
});

describe("a document record names a file of its own trip and uploader only", () => {
  it("a removed member cannot get a file back by naming it from a trip of their own", async () => {
    const mine = await tripOf(id.removed);
    await expect(addRecord(id.removed, mine, path.ticket)).rejects.toThrow();
    expect(await readable(id.removed)).toEqual([]);
  });

  it("someone who was never in the trip cannot open a personal file whose path they learned", async () => {
    const mine = await tripOf(id.outsider);
    await expect(addRecord(id.outsider, mine, path.bobPassport, "personal")).rejects.toThrow();
    expect(await readable(id.outsider)).toEqual([]);
  });

  it("a member cannot name another member's file inside the same trip", async () => {
    await expect(addRecord(id.alice, id.trip, path.bobPassport)).rejects.toThrow();
    expect(await readable(id.alice)).not.toContain(path.bobPassport);
  });

  it("a record cannot be changed to point somewhere else", async () => {
    await expect(
      asUser(db, id.alice, (tx) => tx.query("update documents set storage_path = $1 where id = $2", [path.bobPassport, id.alicePassport])),
    ).rejects.toThrow(/permission denied/);
  });

  it("a member cannot make an organizer's trip deletion remove a file of another trip they organize", async () => {
    const otherFile = `${id.otherTrip}/${id.otherOrganizer}/d8-lodge.pdf`;
    await db.exec(`
      insert into members (trip_id, user_id, role, status) values ('${id.otherTrip}', '${id.organizer}', 'organizer', 'approved');
      insert into storage.objects (bucket_id, name) values ('trip-documents', '${otherFile}');`);
    await expect(addRecord(id.alice, id.trip, otherFile)).rejects.toThrow();
    // What deleting the trip removes: the files its records name.
    const named = await asUser(db, id.organizer, (tx) => tx.query<{ storage_path: string }>("select storage_path from documents where trip_id = $1", [id.trip]));
    expect(named.rows.map((r) => r.storage_path)).not.toContain(otherFile);
  });

  it("the app's own uploads still work", async () => {
    await upload(id.alice, `${id.trip}/${id.alice}/d9-visa.pdf`);
    await expect(addRecord(id.alice, id.trip, `${id.trip}/${id.alice}/d9-visa.pdf`, "personal")).resolves.toBeDefined();
    expect(await readable(id.alice)).toContain(`${id.trip}/${id.alice}/d9-visa.pdf`);
  });

  it("two records cannot claim the same file", async () => {
    await expect(addRecord(id.organizer, id.trip, path.ticket)).rejects.toThrow();
  });
});

describe("deleting", () => {
  it("people can delete files in their own folder only", async () => {
    await upload(id.alice, `${id.trip}/${id.alice}/d9-ticket.pdf`);
    expect(await remove(id.bob, `${id.trip}/${id.alice}/d9-ticket.pdf`)).toBe(0);
    expect(await remove(id.alice, `${id.trip}/${id.alice}/d9-ticket.pdf`)).toBe(1);
  });
});
