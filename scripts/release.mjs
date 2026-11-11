#!/usr/bin/env node
// Releases the latest main to production: checks, tests, database migrations, then the website.
//
//   npm run release                       the whole thing, asks before it changes anything
//   npm run release -- --dry-run          shows what it would do, changes nothing
//   npm run release -- --yes              no question asked (for when you have already looked)
//   flags: --skip-tests  --skip-migrations  --skip-deploy  --templates  --functions  --baseline 13  --env path
//
// Credentials come from .env.release (see scripts/release.env.example). It never prints them.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import {
  ENSURE_TABLE_SQL,
  baselineMigrations,
  bundleName,
  listMigrations,
  migrationStatement,
  missingVars,
  parseEnv,
  pendingMigrations,
  recordBaselineSql,
  redact,
} from "./release-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};
const dry = flag("dry-run");
const SITE = "https://hoppinclub.com";
const PROJECT = "hoppinclub";

const say = (text = "") => console.log(text);
const step = (text) => say(`\n== ${text}`);
function fail(text) {
  console.error(`\nStopped: ${text}`);
  process.exit(1);
}

// ---- credentials
const envFile = resolve(root, option("env", ".env.release"));
const fromFile = existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {};
const env = { ...fromFile, ...Object.fromEntries(Object.entries(process.env).filter(([, v]) => v)) };
if (!existsSync(envFile) && missingVars(env).length > 0) fail(`no ${envFile}. Copy scripts/release.env.example to .env.release and fill it in.`);
const missing = missingVars(env);
if (missing.length > 0) fail(`these are missing from ${envFile}: ${missing.join(", ")}`);
const SECRETS = Object.values(env).filter((v) => typeof v === "string" && v.length >= 12);
const clean = (text) => redact(text, SECRETS);

const sh = (cmd, cmdArgs, options = {}) => execFileSync(cmd, cmdArgs, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options }).trim();
function run(cmd, cmdArgs, options = {}) {
  const r = spawnSync(cmd, cmdArgs, { cwd: root, stdio: "inherit", env: { ...process.env, ...env }, ...options });
  if (r.status !== 0) fail(`${cmd} ${cmdArgs.join(" ")} did not succeed`);
}

async function ask(question) {
  if (flag("yes") || dry) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
  rl.close();
  return answer === "y" || answer === "yes";
}

async function supabase(query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(clean(`Supabase said ${response.status}: ${text.slice(0, 400)}`));
  return JSON.parse(text);
}

// ---- 1. the code to release
step("1/6 The code");
if (sh("git", ["branch", "--show-current"]) !== "main") fail("you are not on main. Run: git checkout main");
const dirty = sh("git", ["status", "--porcelain", "--untracked-files=no"]);
if (dirty) fail(`there are uncommitted changes to tracked files. Commit or stash them first:\n${dirty}`);
sh("git", ["fetch", "origin", "main"]);
const behind = Number(sh("git", ["rev-list", "--count", "HEAD..origin/main"]));
const ahead = Number(sh("git", ["rev-list", "--count", "origin/main..HEAD"]));
if (ahead > 0) fail(`main has ${ahead} commit(s) that are not on GitHub. Push them (or merge through a pull request) first.`);
if (behind > 0) fail(`main is ${behind} commit(s) behind GitHub. Run: git pull`);
const head = sh("git", ["log", "-1", "--format=%h %s"]);
say(`Releasing: ${head}`);

// ---- 2. what the database still needs
step("2/6 Database migrations");
const migrationsDir = join(root, "supabase", "migrations");
const files = listMigrations(migrationsDir);
const baseline = Number(option("baseline", "13"));
let applied = [];
let tableExists = false;
if (!flag("skip-migrations")) {
  const exists = await supabase("select to_regclass('public.release_migrations') as t");
  tableExists = Boolean(exists[0]?.t);
  if (tableExists) applied = (await supabase("select filename from public.release_migrations order by filename")).map((row) => row.filename);
}
const first = !tableExists || applied.length === 0;
const pending = flag("skip-migrations") ? [] : pendingMigrations(files, applied, baseline);
if (flag("skip-migrations")) say("Skipped (--skip-migrations).");
else {
  if (first) say(`First run: migrations up to ${String(baseline).padStart(3, "0")} are taken as already applied (they were done by hand).`);
  say(pending.length ? `To apply, in order:\n  ${pending.join("\n  ")}` : "Nothing to apply: the database is up to date.");
}

// ---- 3. checks
step("3/6 Checks");
if (flag("skip-tests")) say("Skipped (--skip-tests).");
else if (dry) say("Would run: npm run typecheck, then npm test.");
else {
  run("npm", ["run", "typecheck"]);
  run("npm", ["test"]);
}

// ---- the plan, and the question
const doTemplates = flag("templates");
const doFunctions = flag("functions");
say("\nPlan:");
say(`  ${pending.length ? `apply ${pending.length} migration(s) to the database` : "no database changes"}`);
if (doTemplates) say("  apply the email templates");
if (doFunctions) say("  deploy the sign-up queue function");
say(flag("skip-deploy") ? "  (website deploy skipped)" : `  build and deploy the website to ${SITE}`);
if (dry) {
  say("\nDry run: nothing was changed.");
  process.exit(0);
}
if (!(await ask("\nGo ahead and release?"))) fail("cancelled, nothing was changed.");

// ---- 4. database
if (pending.length || (first && !flag("skip-migrations"))) {
  step("4/6 Applying migrations");
  await supabase(ENSURE_TABLE_SQL);
  const seeded = baselineMigrations(files, applied, baseline);
  if (seeded.length) {
    await supabase(recordBaselineSql(seeded));
    say(`Recorded ${seeded.length} earlier migration(s) as applied.`);
  }
  for (const file of pending) {
    process.stdout.write(`  ${file} ... `);
    try {
      await supabase(migrationStatement(file, readFileSync(join(migrationsDir, file), "utf8")));
      say("done");
    } catch (error) {
      say("FAILED");
      fail(`${file} did not apply (nothing from it was kept): ${error.message}\nFix it, then run this again; the migrations before it stay applied.`);
    }
  }
} else step("4/6 Applying migrations\nNothing to do.");

if (doTemplates) {
  step("Email templates");
  run("node", ["scripts/supabase-email.mjs", "templates"]);
}
if (doFunctions) {
  step("Sign-up queue functions");
  const cli = spawnSync("supabase", ["--version"], { encoding: "utf8" });
  if (cli.status !== 0) say("The Supabase command-line tool is not installed, so the functions were not deployed. See docs/signup-queue.md.");
  else for (const fn of ["drain-signup-queue", "join-signup-queue"]) run("supabase", ["functions", "deploy", fn, "--no-verify-jwt", "--project-ref", env.SUPABASE_PROJECT_REF]);
}

// ---- 5. website
if (flag("skip-deploy")) {
  step("5/6 Website\nSkipped (--skip-deploy).");
} else {
  step("5/6 Building and deploying the website");
  if (!env.CLOUDFLARE_ACCOUNT_ID) {
    const zones = await (await fetch("https://api.cloudflare.com/client/v4/zones?name=hoppinclub.com", { headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` } })).json();
    env.CLOUDFLARE_ACCOUNT_ID = zones?.result?.[0]?.account?.id;
    if (!env.CLOUDFLARE_ACCOUNT_ID) fail("could not find the Cloudflare account. Add CLOUDFLARE_ACCOUNT_ID to .env.release.");
  }
  run("npx", ["vite", "build"], { cwd: join(root, "apps", "web") });
  run("npx", ["wrangler", "pages", "deploy", "dist", "--project-name", PROJECT, "--branch", "main", "--commit-dirty=true"], { cwd: join(root, "apps", "web") });
}

// ---- 6. is it really live?
step("6/6 Checking the live site");
if (flag("skip-deploy")) say("Skipped.");
else {
  const built = bundleName(readFileSync(join(root, "apps", "web", "dist", "index.html"), "utf8"));
  let live = null;
  for (let attempt = 0; attempt < 6 && live !== built; attempt += 1) {
    if (attempt > 0) await new Promise((done) => setTimeout(done, 5000));
    live = bundleName(await (await fetch(`${SITE}/?r=${Date.now()}`)).text());
  }
  say(`Built:  ${built}\nLive:   ${live}`);
  if (live !== built) fail("the live site is not serving the new build yet. Wait a minute and check again.");
  for (const path of ["/", "/trips", "/auth/confirm"]) {
    const status = (await fetch(`${SITE}${path}`)).status;
    say(`${path}  ${status}`);
    if (status !== 200) fail(`${path} answered ${status}.`);
  }
}
say(`\nReleased ${head}. Remember: fully close and reopen the app on your phone to get the new version.`);
