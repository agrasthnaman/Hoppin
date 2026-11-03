import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const defaultMigrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

/**
 * Creates a fresh in-memory Postgres (PGlite) and applies every `.sql` file in
 * `migrationsDir` in filename order. Used by row-level-security and schema tests,
 * so no Docker is needed.
 */
export async function makeTestDb(migrationsDir: string = defaultMigrationsDir): Promise<PGlite> {
  const db = new PGlite();
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const file of files) {
    await db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  }
  return db;
}
