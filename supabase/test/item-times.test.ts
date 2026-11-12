import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, id, seededDb } from "./helpers";

let db: PGlite;
beforeEach(async () => {
  db = await seededDb();
});

const add = (startsAt: string, endsAt: string | null = null) =>
  asUser(db, id.alice, (tx) =>
    tx.query(
      "insert into items (trip_id, owner_id, kind, visibility, starts_at, ends_at, tz, title) values ($1, $2, 'plan', 'shared', $3, $4, 'UTC', 'Lunch')",
      [id.trip, id.alice, startsAt, endsAt],
    ),
  );

describe("an item's times", () => {
  it("are any date a screen can show", async () => {
    await expect(add("2026-12-01T10:00:00Z", "2026-12-03T10:00:00Z")).resolves.toBeDefined();
    await expect(add("9999-12-31T12:00:00Z")).resolves.toBeDefined();
  });

  it.each(["275761-01-01T00:00:00Z", "10000-01-01T00:00:00Z"])("refuse a start JavaScript cannot format (%s)", async (startsAt) => {
    await expect(add(startsAt)).rejects.toThrow(/items_times_in_range/);
  });

  it("refuse an end past year 9999", async () => {
    await expect(add("2026-12-01T10:00:00Z", "12000-01-01T00:00:00Z")).rejects.toThrow(/items_times_in_range/);
  });
});
