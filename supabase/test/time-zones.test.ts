import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, id, seededDb } from "./helpers";

let db: PGlite;
beforeEach(async () => {
  db = await seededDb();
});

const add = (tz: string, endTz: string | null = null) =>
  asUser(db, id.alice, (tx) =>
    tx.query(
      "insert into items (trip_id, owner_id, kind, visibility, starts_at, tz, end_tz, title) values ($1, $2, 'plan', 'shared', now(), $3, $4, 'Lunch')",
      [id.trip, id.alice, tz, endTz],
    ),
  );

describe("an item's time zones", () => {
  it("accepts every zone the app can offer", async () => {
    const zones = [...Intl.supportedValuesOf("timeZone"), "UTC"];
    const { rows } = await db.query<{ z: string }>("select z from unnest($1::text[]) as z where not is_time_zone(z)", [zones]);
    expect(rows).toEqual([]);
  });

  it.each(["Not/AZone", "IST", "XYZ5", "posix/Asia/Kolkata", "right/UTC", "Factory", ""])("refuses %j as the start zone", async (tz) => {
    await expect(add(tz)).rejects.toThrow(/items_time_zones_known/);
  });

  it("refuses an unknown end zone, and allows none", async () => {
    await expect(add("Asia/Kolkata", "Not/AZone")).rejects.toThrow(/items_time_zones_known/);
    await expect(add("Asia/Kolkata", null)).resolves.toBeDefined();
    await expect(add("Asia/Kolkata", "Europe/London")).resolves.toBeDefined();
  });

  it("cannot be changed to an unknown zone later", async () => {
    await expect(
      asUser(db, id.alice, (tx) => tx.query("update items set tz = 'Not/AZone' where id = $1", [id.aliceOptional])),
    ).rejects.toThrow(/items_time_zones_known/);
  });
});
