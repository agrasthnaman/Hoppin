import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  baselineMigrations,
  bundleName,
  listMigrations,
  migrationStatement,
  missingVars,
  parseEnv,
  pendingMigrations,
  recordBaselineSql,
  redact,
} from "../../scripts/release-lib.mjs";
import { makeTestDb } from "./pglite";

const real = join(process.cwd(), "migrations");

describe("release script: credentials file", () => {
  it("reads KEY=VALUE lines, ignoring comments, blanks and quotes", () => {
    const env = parseEnv('# a comment\n\nA=1\nB = "two words"\nC=\'x\'\nBROKEN\n=nokey\nD=has=equals\n');
    expect(env).toEqual({ A: "1", B: "two words", C: "x", D: "has=equals" });
  });

  it("says which required credentials are missing", () => {
    expect(missingVars({ SUPABASE_ACCESS_TOKEN: "a", SUPABASE_PROJECT_REF: "b" })).toEqual(["CLOUDFLARE_API_TOKEN"]);
    expect(missingVars({ SUPABASE_ACCESS_TOKEN: "a", SUPABASE_PROJECT_REF: "b", CLOUDFLARE_API_TOKEN: "c" })).toEqual([]);
  });

  it("hides secrets from any message, and leaves short or empty values alone", () => {
    expect(redact("token sbp_abcdef123456 failed", ["sbp_abcdef123456"])).toBe("token *** failed");
    expect(redact("nothing here", ["", undefined, "short"])).toBe("nothing here");
  });
});

describe("release script: which migrations to apply", () => {
  const files = ["001_core.sql", "005_expenses.sql", "013_trip_destination.sql", "014_signup_queue.sql", "015_invite_cleanup.sql"];

  it("lists the real migration files in order", () => {
    const listed = listMigrations(real);
    expect(listed[0]).toBe("001_core.sql");
    expect([...listed].sort()).toEqual(listed);
    expect(listed.every((name) => /^\d{3}_.+\.sql$/.test(name))).toBe(true);
  });

  it("on the first run takes everything up to the baseline as done, and applies the rest", () => {
    expect(pendingMigrations(files, [], 13)).toEqual(["014_signup_queue.sql", "015_invite_cleanup.sql"]);
    expect(baselineMigrations(files, [], 13)).toEqual(["001_core.sql", "005_expenses.sql", "013_trip_destination.sql"]);
  });

  it("afterwards trusts only what was recorded, and never repeats it", () => {
    const applied = [...files.slice(0, 4)];
    expect(pendingMigrations(files, applied, 13)).toEqual(["015_invite_cleanup.sql"]);
    expect(baselineMigrations(files, applied, 13)).toEqual([]);
    expect(pendingMigrations(files, files, 13)).toEqual([]);
  });

  it("a migration added later is picked up", () => {
    expect(pendingMigrations([...files, "016_next.sql"], files, 13)).toEqual(["016_next.sql"]);
  });

  it("quotes file names safely when recording them", () => {
    expect(recordBaselineSql(["a'b.sql"])).toContain("('a''b.sql')");
    expect(recordBaselineSql([])).toBe("select 1;");
  });
});

describe("release script: applying a migration and its record together", () => {
  it("wraps the migration and its record in one transaction", () => {
    const sql = migrationStatement("016_x.sql", "create table t (id int);");
    expect(sql.startsWith("begin;")).toBe(true);
    expect(sql.trimEnd().endsWith("commit;")).toBe(true);
    expect(sql).toContain("insert into public.release_migrations (filename) values ('016_x.sql')");
  });

  it("really records a migration and creates its table in a test database (nothing leaks on a failure)", async () => {
    const db = await makeTestDb();
    await db.exec("create table public.release_migrations (filename text primary key, applied_at timestamptz not null default now());");
    await db.exec(migrationStatement("900_test.sql", "create table public.release_probe (id int);"));
    expect((await db.query("select filename from public.release_migrations")).rows).toEqual([{ filename: "900_test.sql" }]);
    await expect(db.exec(migrationStatement("901_bad.sql", "create table public.release_probe (id int);"))).rejects.toThrow();
    await db.exec("rollback;").catch(() => {});
    expect((await db.query("select filename from public.release_migrations order by filename")).rows).toEqual([{ filename: "900_test.sql" }]);
  });
});

describe("release script: checking the live site", () => {
  it("finds the main bundle's name in a page", () => {
    expect(bundleName('<script type="module" src="/assets/index-AbC_12-x.js"></script>')).toBe("assets/index-AbC_12-x.js");
    expect(bundleName("<html></html>")).toBeNull();
  });
});
