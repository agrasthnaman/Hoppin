import { describe, expect, it, vi } from "vitest";
import { joinQueue, verifyTurnstile, type JoinDeps } from "../functions/join-signup-queue/join";

function deps(over: Partial<JoinDeps> = {}) {
  return {
    verifyCaptcha: vi.fn<JoinDeps["verifyCaptcha"]>(async () => true),
    join: vi.fn<JoinDeps["join"]>(async () => "queued"),
    ...over,
  };
}
const body = { email: "neha@example.com", name: "Neha", captchaToken: "token" };

describe("joinQueue", () => {
  it("saves the spot once the bot check passes", async () => {
    const d = deps();
    expect(await joinQueue(body, d)).toEqual({ status: 200, body: { status: "queued" } });
    expect(d.verifyCaptcha).toHaveBeenCalledWith("token");
    expect(d.join).toHaveBeenCalledWith("neha@example.com", "Neha");
  });

  it("refuses without a passing bot check, and never touches the queue", async () => {
    const d = deps({ verifyCaptcha: vi.fn(async () => false) });
    expect(await joinQueue(body, d)).toEqual({ status: 403, body: { error: "captcha" } });
    expect(d.join).not.toHaveBeenCalled();
  });

  it.each([null, "text", {}, { ...body, captchaToken: "" }, { ...body, captchaToken: undefined }, { ...body, email: 5 }, { ...body, name: 5 }])(
    "refuses a malformed request %j before checking anything",
    async (bad) => {
      const d = deps();
      expect(await joinQueue(bad, d)).toEqual({ status: 400, body: { error: "bad-request" } });
      expect(d.verifyCaptcha).not.toHaveBeenCalled();
      expect(d.join).not.toHaveBeenCalled();
    },
  );

  it("a missing name is fine", async () => {
    const d = deps();
    await joinQueue({ email: body.email, captchaToken: "token" }, d);
    expect(d.join).toHaveBeenCalledWith("neha@example.com", null);
  });

  it("passes on what the queue said, and says failed when the database refuses", async () => {
    expect((await joinQueue(body, deps({ join: vi.fn(async () => "full" as const) }))).body).toEqual({ status: "full" });
    expect(await joinQueue(body, deps({ join: vi.fn(async () => Promise.reject(new Error("down"))) }))).toEqual({ status: 500, body: { error: "failed" } });
  });
});

describe("verifyTurnstile", () => {
  const answer = (status: number, json: unknown) => vi.fn<typeof fetch>(async () => new Response(JSON.stringify(json), { status }));

  it("sends the secret and the token to Cloudflare and trusts only a clear yes", async () => {
    const fetcher = answer(200, { success: true });
    expect(await verifyTurnstile("secret", "token", fetcher)).toBe(true);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(Object.fromEntries(init!.body as URLSearchParams)).toEqual({ secret: "secret", response: "token" });
  });

  it.each([
    [200, { success: false, "error-codes": ["timeout-or-duplicate"] }],
    [200, { success: "true" }],
    [200, null],
    [500, { success: true }],
  ])("says no for %s %j", async (status, json) => {
    expect(await verifyTurnstile("secret", "token", answer(status, json))).toBe(false);
  });
});
