import { describe, expect, it, vi } from "vitest";
import { authorized, drain, isAlreadyRegistered, isRateLimit, scrub, type DrainDeps, type InviteResult, type QueueRow } from "../functions/drain-signup-queue/drain";

const row = (n: number): QueueRow => ({ id: `id-${n}`, email: `person${n}@example.com`, display_name: `Person ${n}` });
const ok: InviteResult = { error: null };

function setup(rows: QueueRow[], invite: (email: string) => InviteResult | Promise<InviteResult> = () => ok) {
  const logs: string[] = [];
  const marks: Array<[string, string, string | null]> = [];
  const deps: DrainDeps = {
    claim: vi.fn(async () => rows),
    invite: vi.fn(async (email: string) => invite(email)),
    mark: vi.fn(async (id: string, status: "invited" | "skipped" | "waiting", error: string | null) => void marks.push([id, status, error])),
    log: (line: string) => void logs.push(line),
  };
  return { deps, logs, marks };
}

describe("drain", () => {
  it("invites everyone claimed and marks them invited", async () => {
    const { deps, marks } = setup([row(1), row(2)]);
    const result = await drain(deps);
    expect(result).toEqual({ claimed: 2, invited: 2, skipped: 0, deferred: 0, stoppedByLimit: false });
    expect(marks).toEqual([["id-1", "invited", null], ["id-2", "invited", null]]);
    expect(deps.invite).toHaveBeenCalledWith("person1@example.com", "Person 1");
  });

  it("makes no email calls at all when the queue is empty or paused (nothing claimed)", async () => {
    const { deps, marks } = setup([]);
    const result = await drain(deps);
    expect(result).toEqual({ claimed: 0, invited: 0, skipped: 0, deferred: 0, stoppedByLimit: false });
    expect(deps.invite).not.toHaveBeenCalled();
    expect(marks).toEqual([]);
  });

  it("stops at the first rate-limit error and leaves that person and everyone after waiting, untouched", async () => {
    const { deps, marks } = setup([row(1), row(2), row(3), row(4)], (email) =>
      email === "person3@example.com" ? { error: { status: 429, code: "over_email_send_rate_limit", message: "email rate limit exceeded" } } : ok,
    );
    const result = await drain(deps);
    expect(result).toEqual({ claimed: 4, invited: 2, skipped: 0, deferred: 2, stoppedByLimit: true });
    expect(deps.invite).toHaveBeenCalledTimes(3); // person 4 is never even tried
    expect(marks).toEqual([
      ["id-1", "invited", null],
      ["id-2", "invited", null],
      ["id-3", "waiting", null], // handed back with no error and no spent try
      ["id-4", "waiting", null],
    ]);
  });

  it("recognises the ways the email service says it is over its limit", () => {
    expect(isRateLimit({ status: 429, message: "x" })).toBe(true);
    expect(isRateLimit({ code: "over_email_send_rate_limit", message: "x" })).toBe(true);
    expect(isRateLimit({ code: "over_request_rate_limit", message: "x" })).toBe(true);
    expect(isRateLimit({ message: "Email rate limit exceeded" })).toBe(true);
    expect(isRateLimit({ status: 500, message: "boom" })).toBe(false);
  });

  it("marks someone who already has an account as skipped and carries on", async () => {
    const { deps, marks } = setup([row(1), row(2)], (email) =>
      email === "person1@example.com" ? { error: { status: 422, code: "email_exists", message: "A user with this email address has already been registered" } } : ok,
    );
    const result = await drain(deps);
    expect(result).toMatchObject({ invited: 1, skipped: 1, deferred: 0, stoppedByLimit: false });
    expect(marks).toEqual([["id-1", "skipped", null], ["id-2", "invited", null]]);
    expect(isAlreadyRegistered({ message: "User already registered" })).toBe(true);
    expect(isAlreadyRegistered({ status: 500, message: "boom" })).toBe(false);
  });

  it("leaves a person with any other error waiting, remembers why without their address, and carries on", async () => {
    const { deps, marks } = setup([row(1), row(2)], (email) =>
      email === "person1@example.com" ? { error: { status: 500, message: "could not deliver to person1@example.com" } } : ok,
    );
    const result = await drain(deps);
    expect(result).toMatchObject({ invited: 1, skipped: 0, deferred: 1, stoppedByLimit: false });
    expect(marks[0]).toEqual(["id-1", "waiting", "could not deliver to [email]"]);
    expect(marks[1]).toEqual(["id-2", "invited", null]);
  });

  it("keeps going when an outcome cannot be recorded", async () => {
    const { deps } = setup([row(1), row(2)]);
    vi.mocked(deps.mark).mockRejectedValueOnce(new Error("db down"));
    const result = await drain(deps);
    expect(result.invited).toBe(2);
    expect(deps.invite).toHaveBeenCalledTimes(2);
  });

  it("passes on a failure to claim (so the caller can answer with a plain failure)", async () => {
    const { deps } = setup([]);
    vi.mocked(deps.claim).mockRejectedValueOnce(new Error("db down"));
    await expect(drain(deps)).rejects.toThrow("db down");
    expect(deps.invite).not.toHaveBeenCalled();
  });

  it("never writes an email address to the log, whatever happens", async () => {
    const { deps, logs } = setup([row(1), row(2), row(3), row(4)], (email) => {
      if (email === "person1@example.com") return { error: { status: 500, message: "bad mailbox person1@example.com" } };
      if (email === "person2@example.com") return { error: { status: 422, code: "email_exists", message: "person2@example.com already registered" } };
      if (email === "person4@example.com") return { error: { status: 429, message: "rate limit for person4@example.com" } };
      return ok;
    });
    vi.mocked(deps.mark).mockRejectedValueOnce(new Error("db down for person1@example.com"));
    await drain(deps);
    const text = logs.join("\n");
    expect(text).not.toMatch(/@/);
    expect(text).not.toMatch(/person\d/);
    expect(text).toContain("claimed 4");
  });
});

describe("scrub", () => {
  it("removes addresses and keeps the text short", () => {
    expect(scrub("failed for a.b+c@example.co.uk and x@y.io today")).toBe("failed for [email] and [email] today");
    expect(scrub("x".repeat(500))).toHaveLength(200);
  });
});

describe("authorized", () => {
  it("needs the right secret", () => {
    expect(authorized("s3cret-value", "s3cret-value")).toBe(true);
    expect(authorized("s3cret-valuf", "s3cret-value")).toBe(false);
    expect(authorized("s3cret", "s3cret-value")).toBe(false);
    expect(authorized("s3cret-value-and-more", "s3cret-value")).toBe(false);
  });

  it("is never satisfied by a missing secret on either side", () => {
    expect(authorized(null, "s3cret-value")).toBe(false);
    expect(authorized("", "s3cret-value")).toBe(false);
    expect(authorized("anything", undefined)).toBe(false);
    expect(authorized("", "")).toBe(false);
    expect(authorized(undefined, undefined)).toBe(false);
  });
});
