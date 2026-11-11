import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { makeTestDb } from "./pglite";

let db: PGlite;
beforeEach(async () => {
  db = await makeTestDb();
});

type Role = "anon" | "authenticated" | "service_role";
const as = async <T>(role: Role, sql: string, params: unknown[] = []): Promise<T[]> =>
  db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    return (await tx.query<T>(sql, params)).rows;
  });
const join = async (email: string, name: string | null = "Neha", role: Role = "service_role") =>
  (await as<{ r: { status: string } }>(role, "select join_signup_queue($1, $2) as r", [email, name]))[0]!.r.status;
const status = async (email: string) => (await as<{ r: { status: string } }>("anon", "select signup_queue_status($1) as r", [email]))[0]!.r.status;
const rows = async () =>
  (
    await db.query<{ email: string; display_name: string | null; status: string; attempts: number; claimed_at: string | null; last_error: string | null }>(
      "select email, display_name, status, attempts, claimed_at::text, last_error from signup_queue order by created_at, id",
    )
  ).rows;
const claim = async () => as<{ id: string; email: string; display_name: string | null }>("service_role", "select * from claim_signup_queue()");
const mark = async (id: string, state: string, error: string | null = null) => as("service_role", "select mark_signup_queue($1, $2, $3)", [id, state, error]);

describe("joining the queue", () => {
  it("saves a spot, and joining again says already queued without adding a second row or failing", async () => {
    expect(await join("neha@example.com")).toBe("queued");
    expect(await join("neha@example.com")).toBe("already_queued");
    expect(await join("neha@example.com", "Someone else")).toBe("already_queued");
    expect(await rows()).toHaveLength(1);
    expect((await rows())[0]).toMatchObject({ email: "neha@example.com", display_name: "Neha", status: "waiting" });
  });

  it("treats capital letters and stray spaces as the same email", async () => {
    expect(await join("  Neha@Example.COM ")).toBe("queued");
    expect(await join("neha@example.com")).toBe("already_queued");
    expect(await join("NEHA@EXAMPLE.COM  ")).toBe("already_queued");
    expect(await rows()).toHaveLength(1);
    expect((await rows())[0]!.email).toBe("neha@example.com");
  });

  it("does not queue an email that already has an account", async () => {
    await db.exec("insert into auth.users (id, email) values (gen_random_uuid(), 'Riya@Example.com')");
    expect(await join("riya@example.com")).toBe("registered");
    expect(await rows()).toHaveLength(0);
  });

  it("stops taking people when the queue is full", async () => {
    await db.exec("update signup_queue_settings set max_waiting = 2");
    expect(await join("a@example.com")).toBe("queued");
    expect(await join("b@example.com")).toBe("queued");
    expect(await join("c@example.com")).toBe("full");
    expect(await join("a@example.com")).toBe("already_queued"); // someone already in still gets a calm answer
    expect(await rows()).toHaveLength(2);
  });

  it("refuses something that is not an email, and keeps the name short", async () => {
    await expect(join("not an email")).rejects.toThrow(/valid email/);
    await expect(join("")).rejects.toThrow(/valid email/);
    await join("long@example.com", "x".repeat(300));
    expect((await rows())[0]!.display_name).toHaveLength(80);
    await join("blank@example.com", "   ");
    expect((await rows())[1]!.display_name).toBeNull();
  });

  it("is only for the join-signup-queue function (it checks the bot-check token), never the public key", async () => {
    await expect(join("anon@example.com", "A", "anon")).rejects.toThrow(/permission denied/);
    await expect(join("user@example.com", "U", "authenticated")).rejects.toThrow(/permission denied/);
    expect(await rows()).toEqual([]);
  });
});

describe("status", () => {
  it("says none, waiting, invited or registered", async () => {
    expect(await status("x@example.com")).toBe("none");
    await join("x@example.com");
    expect(await status(" X@Example.com")).toBe("waiting");
    const [one] = await claim();
    await mark(one!.id, "invited");
    expect(await status("x@example.com")).toBe("invited");
    await db.exec("insert into auth.users (id, email) values (gen_random_uuid(), 'x@example.com')");
    expect(await status("x@example.com")).toBe("registered");
  });

  it("a skipped person (they already had an account) shows as registered", async () => {
    await join("s@example.com");
    const [one] = await claim();
    await mark(one!.id, "skipped");
    expect(await status("s@example.com")).toBe("registered");
  });
});

describe("nobody reaches the tables directly", () => {
  it.each(["anon", "authenticated"] as const)("%s cannot read, add or change the queue or its settings", async (role) => {
    await join("neha@example.com");
    await expect(as(role, "select * from signup_queue")).rejects.toThrow(/permission denied/);
    await expect(as(role, "insert into signup_queue (email) values ('x@example.com')")).rejects.toThrow(/permission denied/);
    await expect(as(role, "update signup_queue set status = 'invited'")).rejects.toThrow(/permission denied/);
    await expect(as(role, "delete from signup_queue")).rejects.toThrow(/permission denied/);
    await expect(as(role, "select * from signup_queue_settings")).rejects.toThrow(/permission denied/);
    await expect(as(role, "update signup_queue_settings set paused = true")).rejects.toThrow(/permission denied/);
    expect(await rows()).toHaveLength(1);
  });
});

describe("the hourly job", () => {
  it("is given nothing when the queue is empty or paused", async () => {
    expect(await claim()).toEqual([]);
    await join("a@example.com");
    await db.exec("update signup_queue_settings set paused = true");
    expect(await claim()).toEqual([]);
    await db.exec("update signup_queue_settings set paused = false");
    expect(await claim()).toHaveLength(1);
  });

  it("gets the oldest people first, no more than the batch size", async () => {
    await db.exec("update signup_queue_settings set batch_size = 2");
    for (const [e, hours] of [["a", 3], ["b", 2], ["c", 1]] as const) {
      await join(`${e}@example.com`);
      await db.exec(`update signup_queue set created_at = now() - interval '${hours} hours' where email = '${e}@example.com'`);
    }
    expect((await claim()).map((r) => r.email)).toEqual(["a@example.com", "b@example.com"]);
  });

  it("never gives the same person to two runs, until they are marked, released or the claim goes stale", async () => {
    for (const [e, hours] of [["a", 3], ["b", 2], ["c", 1]] as const) {
      await join(`${e}@example.com`);
      await db.exec(`update signup_queue set created_at = now() - interval '${hours} hours' where email = '${e}@example.com'`);
    }
    await db.exec("update signup_queue_settings set batch_size = 2");
    const first = await claim();
    const second = await claim();
    expect(first).toHaveLength(2);
    expect(second.map((r) => r.email)).toEqual(["c@example.com"]);
    expect(await claim()).toEqual([]);
    // finished people are never given out again
    await mark(first[0]!.id, "invited");
    expect(await claim()).toEqual([]);
    // a claim the email service told us to give back is available again
    await mark(first[1]!.id, "waiting");
    expect((await claim()).map((r) => r.email)).toEqual([first[1]!.email]);
    // a run that crashed leaves a stale claim, which expires
    await db.exec("update signup_queue set claimed_at = now() - interval '20 minutes' where status = 'waiting'");
    expect((await claim()).length).toBeGreaterThan(0);
  });

  it("counts a try when someone is taken, but not when the claim is handed back untouched", async () => {
    await join("a@example.com");
    const [one] = await claim();
    expect((await rows())[0]!.attempts).toBe(1);
    await mark(one!.id, "waiting"); // the email service said stop
    expect((await rows())[0]).toMatchObject({ attempts: 0, status: "waiting", claimed_at: null, last_error: null });
    const [again] = await claim();
    await mark(again!.id, "waiting", "mailbox full"); // another kind of error: stays in the queue and remembers why
    expect((await rows())[0]).toMatchObject({ attempts: 1, status: "waiting", last_error: "mailbox full" });
  });

  it("records who was invited and when, and rejects an unknown status", async () => {
    await join("a@example.com");
    const [one] = await claim();
    await expect(mark(one!.id, "banana")).rejects.toThrow(/unknown status/);
    await mark(one!.id, "invited");
    const [row] = (await db.query<{ status: string; invited_at: string | null; claimed_at: string | null }>("select status, invited_at::text, claimed_at::text from signup_queue")).rows;
    expect(row!.status).toBe("invited");
    expect(row!.invited_at).not.toBeNull();
    expect(row!.claimed_at).toBeNull();
  });

  it.each(["anon", "authenticated"] as const)("%s cannot claim or mark", async (role) => {
    await join("a@example.com");
    await expect(as(role, "select * from claim_signup_queue()")).rejects.toThrow(/permission denied/);
    const id = (await db.query<{ id: string }>("select id from signup_queue")).rows[0]!.id;
    await expect(as(role, "select mark_signup_queue($1, 'invited', null)", [id])).rejects.toThrow(/permission denied/);
    expect((await rows())[0]!.status).toBe("waiting");
  });

  it("only the service role can claim and mark", async () => {
    await join("a@example.com");
    const [one] = await claim();
    expect(one!.email).toBe("a@example.com");
    await mark(one!.id, "skipped");
    expect((await rows())[0]!.status).toBe("skipped");
  });
});
