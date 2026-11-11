import { describe, expect, it, vi } from "vitest";
import { AuthError, createAuthApi, type PasswordClient } from "../src/lib/auth-api";

function client(rpc: PasswordClient["rpc"]): PasswordClient {
  const nothing = vi.fn().mockResolvedValue({ error: null });
  return {
    auth: {
      signUp: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
      resend: nothing,
      resetPasswordForEmail: nothing,
      updateUser: nothing,
      verifyOtp: nothing,
    },
    rpc,
    functions: { invoke: vi.fn() },
  };
}
const answer = (status: string) => vi.fn().mockResolvedValue({ data: { status }, error: null });

describe("queueStatus", () => {
  it("asks the database about the email and gives back the plain answer", async () => {
    const rpc = answer("waiting");
    expect(await createAuthApi(client(rpc)).queueStatus("a@b.co")).toBe("waiting");
    expect(rpc).toHaveBeenCalledWith("signup_queue_status", { p_email: "a@b.co" });
  });

  it.each(["none", "waiting", "invited", "registered"] as const)("understands %s", async (status) => {
    expect(await createAuthApi(client(answer(status))).queueStatus("a@b.co")).toBe(status);
  });

  it("turns a database failure or an answer it does not know into an AuthError", async () => {
    const failing = vi.fn().mockResolvedValue({ data: null, error: { message: "boom", status: 500 } });
    await expect(createAuthApi(client(failing)).queueStatus("a@b.co")).rejects.toBeInstanceOf(AuthError);
    await expect(createAuthApi(client(answer("banana"))).queueStatus("a@b.co")).rejects.toBeInstanceOf(AuthError);
    await expect(createAuthApi(client(vi.fn().mockResolvedValue({ data: null, error: null }))).queueStatus("a@b.co")).rejects.toBeInstanceOf(AuthError);
  });
});

describe("joinQueue", () => {
  const invoking = (answer: { data: unknown; error: { message: string; context?: { status?: number } } | null }) => vi.fn().mockResolvedValue(answer);
  const api = (invoke: ReturnType<typeof invoking>) => createAuthApi({ ...client(answer("none")), functions: { invoke } });

  it("goes through the join-signup-queue function with the email, the name and the bot-check token, never the password", async () => {
    const invoke = invoking({ data: { status: "queued" }, error: null });
    expect(await api(invoke).joinQueue({ email: "a@b.co", name: "Aman", captchaToken: "tok" })).toBe("queued");
    expect(invoke).toHaveBeenCalledWith("join-signup-queue", { body: { email: "a@b.co", name: "Aman", captchaToken: "tok" } });
  });

  it.each(["queued", "already_queued", "registered", "full"] as const)("understands %s", async (status) => {
    expect(await api(invoking({ data: { status }, error: null })).joinQueue({ email: "a@b.co", name: "A", captchaToken: "t" })).toBe(status);
  });

  it("a refused bot check is a captcha error; any other failure is an AuthError too", async () => {
    await expect(api(invoking({ data: null, error: { message: "403", context: { status: 403 } } })).joinQueue({ email: "a@b.co", name: "A" })).rejects.toMatchObject({ code: "captcha" });
    await expect(api(invoking({ data: null, error: { message: "boom", context: { status: 500 } } })).joinQueue({ email: "a@b.co", name: "A" })).rejects.toMatchObject({ code: "other" });
  });
});
