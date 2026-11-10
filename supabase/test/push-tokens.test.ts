import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, id, seededDb } from "./helpers";

let db: PGlite;
beforeEach(async () => {
  db = await seededDb();
});

async function asPerson(userId: string, sql: string, params: unknown[] = []): Promise<string | null> {
  try {
    await asUser(db, userId, (tx) => tx.query(sql, params));
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe("push_tokens", () => {
  it("lets a person save and read only their own token", async () => {
    expect(await asPerson(id.alice, "insert into push_tokens (user_id, token, platform) values ($1, 'alice-phone', 'ios')", [id.alice])).toBeNull();
    const mine = await asUser(db, id.alice, (tx) => tx.query<{ token: string }>("select token from push_tokens"));
    expect(mine.rows.map((row) => row.token)).toEqual(["alice-phone"]);

    const bobsView = await asUser(db, id.bob, (tx) => tx.query<{ token: string }>("select token from push_tokens"));
    expect(bobsView.rows).toEqual([]);
    expect(await asPerson(id.alice, "insert into push_tokens (user_id, token, platform) values ($1, 'stolen', 'ios')", [id.bob])).toMatch(/row-level security|permission denied/);
  });

  it("refuses the public API key and a platform we do not send to", async () => {
    let anon: string | null = null;
    try {
      await db.transaction(async (tx) => {
        await tx.exec("set local role anon");
        await tx.exec("select * from push_tokens");
      });
    } catch (error) {
      anon = error instanceof Error ? error.message : String(error);
    }
    expect(anon).toMatch(/permission denied/);
    expect(await asPerson(id.alice, "insert into push_tokens (user_id, token, platform) values ($1, 'web', 'web')", [id.alice])).toMatch(/check constraint|violates/);
  });

  it("turns phone updates on only for a member of that trip", async () => {
    const before = await db.query<{ push_on: boolean }>("select push_on from members where user_id = $1 and trip_id = $2", [id.alice, id.trip]);
    expect(before.rows[0]?.push_on).toBe(false);
    expect(await asPerson(id.alice, "select set_push_updates($1, true)", [id.trip])).toBeNull();
    const after = await db.query<{ push_on: boolean }>("select push_on from members where user_id = $1 and trip_id = $2", [id.alice, id.trip]);
    expect(after.rows[0]?.push_on).toBe(true);
    expect(await asPerson(id.outsider, "select set_push_updates($1, true)", [id.trip])).toMatch(/only members of this trip/);
  });

  it("lists tokens only for members who turned phone updates on, and only the job may ask", async () => {
    await asUser(db, id.alice, (tx) => tx.query("insert into push_tokens (user_id, token, platform) values ($1, 'alice-phone', 'ios')", [id.alice]));
    await asUser(db, id.bob, (tx) => tx.query("insert into push_tokens (user_id, token, platform) values ($1, 'bob-phone', 'android')", [id.bob]));
    await asUser(db, id.alice, (tx) => tx.query("select set_push_updates($1, true)", [id.trip]));

    const targets = await db.query<{ push_targets: { token: string }[] }>("select push_targets($1) as push_targets", [id.trip]);
    expect(targets.rows[0]?.push_targets).toEqual([{ user_id: id.alice, token: "alice-phone", platform: "ios" }]);
    expect(await asPerson(id.alice, "select push_targets($1)", [id.trip])).toMatch(/permission denied/);
  });

  it("removes the token when the account is deleted", async () => {
    await asUser(db, id.alice, (tx) => tx.query("insert into push_tokens (user_id, token, platform) values ($1, 'alice-phone', 'ios')", [id.alice]));
    expect(await asPerson(id.alice, "select delete_my_account()")).toBeNull();
    const left = await db.query<{ n: string }>("select count(*)::text as n from push_tokens where user_id = $1", [id.alice]);
    expect(left.rows[0]?.n).toBe("0");
  });
});
