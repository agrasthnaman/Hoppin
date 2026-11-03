import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTestDb } from "./pglite";

function migrationsDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "hoppin-migrations-"));
  for (const [name, sql] of Object.entries(files)) {
    writeFileSync(join(dir, name), sql);
  }
  return dir;
}

describe("makeTestDb", () => {
  it("returns a working empty database when there are no migrations", async () => {
    const db = await makeTestDb(migrationsDir({}));
    const result = await db.query<{ one: number }>("select 1 as one");
    expect(result.rows[0]?.one).toBe(1);
  });

  it("applies migration files in filename order", async () => {
    const dir = migrationsDir({
      "002_add_name.sql": "alter table trips add column name text;",
      "001_create_trips.sql": "create table trips (id int primary key);",
    });
    const db = await makeTestDb(dir);
    await db.query("insert into trips (id, name) values (1, 'Goa')");
    const result = await db.query<{ name: string }>("select name from trips");
    expect(result.rows[0]?.name).toBe("Goa");
  });

  it("gives each call a fresh, isolated database", async () => {
    const dir = migrationsDir({ "001_t.sql": "create table t (id int);" });
    const a = await makeTestDb(dir);
    const b = await makeTestDb(dir);
    await a.query("insert into t values (1)");
    const result = await b.query<{ n: number }>("select count(*)::int as n from t");
    expect(result.rows[0]?.n).toBe(0);
  });
});
