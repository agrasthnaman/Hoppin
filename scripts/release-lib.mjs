// The pure pieces of scripts/release.mjs, kept apart so they can be tested without touching Supabase or Cloudflare.
import { readdirSync } from "node:fs";

/** Reads KEY=VALUE lines (comments and blank lines ignored; surrounding quotes removed). */
export function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const at = line.indexOf("=");
    if (at < 1) continue;
    const key = line.slice(0, at).trim();
    let value = line.slice(at + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

/** The migration files in order: `001_core.sql`, `005_expenses.sql`, ... */
export function listMigrations(dir) {
  return readdirSync(dir)
    .filter((name) => /^\d{3}_.+\.sql$/.test(name))
    .sort();
}

const numberOf = (filename) => Number(filename.slice(0, 3));

/**
 * Which migrations still have to be applied. `applied` is what the project already recorded. When it recorded
 * nothing yet (the first run of this script), every migration up to `baseline` is taken as already there, because
 * those were applied by hand before this script existed.
 */
export function pendingMigrations(files, applied, baseline) {
  const known = new Set(applied.length > 0 ? applied : files.filter((f) => numberOf(f) <= baseline));
  return files.filter((f) => !known.has(f));
}

/** The files to record as already applied on the first run. */
export function baselineMigrations(files, applied, baseline) {
  return applied.length > 0 ? [] : files.filter((f) => numberOf(f) <= baseline);
}

const quote = (text) => `'${text.replace(/'/g, "''")}'`;

/** One migration and its record, in one transaction: it all happens or none of it does. */
export function migrationStatement(filename, sql) {
  return `begin;\n${sql}\n;\ninsert into public.release_migrations (filename) values (${quote(filename)}) on conflict do nothing;\ncommit;`;
}

export const ENSURE_TABLE_SQL = `
create table if not exists public.release_migrations (filename text primary key, applied_at timestamptz not null default now());
alter table public.release_migrations enable row level security;
revoke all on public.release_migrations from anon, authenticated;
select filename from public.release_migrations order by filename;`;

export function recordBaselineSql(filenames) {
  if (filenames.length === 0) return "select 1;";
  return `insert into public.release_migrations (filename) values ${filenames.map((f) => `(${quote(f)})`).join(", ")} on conflict do nothing;`;
}

/** Hides secrets, in case an error message ever echoes one back. */
export function redact(text, secrets) {
  let out = String(text);
  for (const secret of secrets) if (secret && secret.length >= 8) out = out.split(secret).join("***");
  return out;
}

/** `assets/index-AbC123.js` from a page's HTML, or null. */
export function bundleName(html) {
  return html.match(/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0] ?? null;
}

export const REQUIRED = ["SUPABASE_ACCESS_TOKEN", "SUPABASE_PROJECT_REF", "CLOUDFLARE_API_TOKEN"];

export function missingVars(env) {
  return REQUIRED.filter((key) => !env[key]);
}
