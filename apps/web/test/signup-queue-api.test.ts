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
  it("sends only the email and the name", async () => {
    const rpc = answer("queued");
    expect(await createAuthApi(client(rpc)).joinQueue({ email: "a@b.co", name: "Aman" })).toBe("queued");
    expect(rpc).toHaveBeenCalledWith("join_signup_queue", { p_email: "a@b.co", p_name: "Aman" });
    expect(Object.keys(rpc.mock.calls[0]![1] as object).sort()).toEqual(["p_email", "p_name"]);
  });

  it.each(["queued", "already_queued", "registered", "full"] as const)("understands %s", async (status) => {
    expect(await createAuthApi(client(answer(status))).joinQueue({ email: "a@b.co", name: "A" })).toBe(status);
  });

  it("turns a database failure into an AuthError", async () => {
    const failing = vi.fn().mockResolvedValue({ data: null, error: { message: "boom", status: 500 } });
    await expect(createAuthApi(client(failing)).joinQueue({ email: "a@b.co", name: "A" })).rejects.toBeInstanceOf(AuthError);
  });
});
