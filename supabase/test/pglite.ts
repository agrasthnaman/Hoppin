import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const testDir = dirname(fileURLToPath(import.meta.url));
const defaultMigrationsDir = join(testDir, "..", "migrations");

/**
 * Creates a fresh in-memory Postgres (PGlite), applies `bootstrap.sql` (the bits Supabase
 * provides: auth schema, auth.uid(), API roles), then every `.sql` file in `migrationsDir`
 * in filename order. Used by row-level-security and schema tests, so no Docker is needed.
 */
export async function makeTestDb(migrationsDir: string = defaultMigrationsDir): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(readFileSync(join(testDir, "bootstrap.sql"), "utf8"));
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const file of files) {
    await db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  }
  return db;
}
