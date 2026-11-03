import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, id, seededDb } from "./helpers";

let db: PGlite;
beforeEach(async () => {
  db = await seededDb();
  // The seeded documents point at these files.
  await db.exec(`
    insert into storage.objects (bucket_id, name) values
      ('trip-documents', 'trip/ticket.pdf'),
      ('trip-documents', 'trip/alice-passport.pdf'),
      ('trip-documents', 'trip/bob-passport.pdf'),
      ('trip-documents', 'trip/orphan.pdf');
  `);
});

const upload = (user: string, name: string) =>
  asUser(db, user, (tx) => tx.query("insert into storage.objects (bucket_id, name, owner) values ('trip-documents', $1, $2)", [name, user]));
const readable = async (user: string) =>
  (await asUser(db, user, (tx) => tx.query<{ name: string }>("select name from storage.objects order by name"))).rows.map((r) => r.name);
const remove = async (user: string, name: string) =>
  (await asUser(db, user, (tx) => tx.query("delete from storage.objects where name = $1 returning 1", [name]))).rows.length;

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
    expect(await readable(id.alice)).toEqual(["trip/alice-passport.pdf", "trip/ticket.pdf"]);
    expect(await readable(id.bob)).toEqual(["trip/bob-passport.pdf", "trip/ticket.pdf"]);
  });

  it("the organizer can also open personal documents", async () => {
    expect(await readable(id.organizer)).toEqual(["trip/alice-passport.pdf", "trip/bob-passport.pdf", "trip/ticket.pdf"]);
  });

  it("a file with no document record is not readable by anyone", async () => {
    for (const user of [id.organizer, id.alice, id.bob]) {
      expect(await readable(user), user).not.toContain("trip/orphan.pdf");
    }
  });

  it("outsiders, pending and removed members can read nothing", async () => {
    for (const user of [id.outsider, id.pending, id.removed]) {
      expect(await readable(user), user).toEqual([]);
    }
  });
});

describe("deleting", () => {
  it("people can delete files in their own folder only", async () => {
    await upload(id.alice, `${id.trip}/${id.alice}/d9-ticket.pdf`);
    expect(await remove(id.bob, `${id.trip}/${id.alice}/d9-ticket.pdf`)).toBe(0);
    expect(await remove(id.alice, `${id.trip}/${id.alice}/d9-ticket.pdf`)).toBe(1);
  });
});
