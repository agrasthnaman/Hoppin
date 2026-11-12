import { describe, expect, it, vi } from "vitest";
import { AuthError, createAuthApi } from "../src/lib/auth-api";

const ok = { data: { session: null }, error: null };
function client(over: Record<string, unknown> = {}) {
  return {
    auth: {
      signUp: vi.fn().mockResolvedValue(ok),
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session: {} }, error: null }),
      resend: vi.fn().mockResolvedValue({ error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
      updateUser: vi.fn().mockResolvedValue({ error: null }),
      verifyOtp: vi.fn().mockResolvedValue({ error: null }),
      reauthenticate: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      ...over,
    },
    rpc: vi.fn().mockResolvedValue({ data: { status: "none" }, error: null }),
    functions: { invoke: vi.fn().mockResolvedValue({ data: { status: "queued" }, error: null }) },
  };
}
const fail = (code: string, message = "x", status = 400) => ({ data: { session: null }, error: { code, message, status } });

describe("signUp for an address that already has an account", () => {
  it("says so, instead of pretending a confirmation email was sent", async () => {
    const c = client({ signUp: vi.fn().mockResolvedValue({ data: { session: null, user: { identities: [] } }, error: null }) });
    await expect(createAuthApi(c).signUp({ email: "old@x.co", password: "longenoughpw", name: "Old", redirectTo: "x" })).rejects.toMatchObject({ code: "already-registered" });
  });

  it("a brand-new sign-up still needs confirming", async () => {
    const c = client({ signUp: vi.fn().mockResolvedValue({ data: { session: null, user: { identities: [{ id: "1" }] } }, error: null }) });
    expect(await createAuthApi(c).signUp({ email: "new@x.co", password: "longenoughpw", name: "New", redirectTo: "x" })).toEqual({ confirmationNeeded: true });
  });
});

describe("signUp", () => {
  it("creates the account with the name and a confirmation link back to the app", async () => {
    const c = client();
    const r = await createAuthApi(c).signUp({ email: "n@x.co", password: "longenoughpw", name: "Neha", redirectTo: "https://h.app/join/t" });
    expect(c.auth.signUp).toHaveBeenCalledWith({
      email: "n@x.co",
      password: "longenoughpw",
      options: { emailRedirectTo: "https://h.app/join/t", data: { display_name: "Neha" } },
    });
    expect(r).toEqual({ confirmationNeeded: true });
  });

  it("says no confirmation is needed when a session came back", async () => {
    const c = client({ signUp: vi.fn().mockResolvedValue({ data: { session: {} }, error: null }) });
    expect(await createAuthApi(c).signUp({ email: "a@b.co", password: "longenoughpw", name: "A", redirectTo: "x" })).toEqual({ confirmationNeeded: false });
  });

  it("refuses a password that is too short before calling the server", async () => {
    const c = client();
    await expect(createAuthApi(c).signUp({ email: "a@b.co", password: "short", name: "A", redirectTo: "x" })).rejects.toMatchObject({ code: "weak-password" });
    expect(c.auth.signUp).not.toHaveBeenCalled();
  });

  it("maps server errors to readable codes", async () => {
    const run = (e: unknown) =>
      createAuthApi(client({ signUp: vi.fn().mockResolvedValue(e) })).signUp({ email: "a@b.co", password: "longenoughpw", name: "A", redirectTo: "x" });
    await expect(run(fail("weak_password"))).rejects.toMatchObject({ code: "weak-password" });
    await expect(run(fail("over_email_send_rate_limit", "rate", 429))).rejects.toMatchObject({ code: "rate-limited" });
    await expect(run(fail("unexpected", "boom", 500))).rejects.toBeInstanceOf(AuthError);
  });
});

describe("signIn", () => {
  it("signs in with email and password", async () => {
    const c = client();
    await createAuthApi(c).signIn({ email: "a@b.co", password: "longenoughpw" });
    expect(c.auth.signInWithPassword).toHaveBeenCalledWith({ email: "a@b.co", password: "longenoughpw" });
  });

  it("tells wrong credentials from an unconfirmed email", async () => {
    const run = (e: unknown) => createAuthApi(client({ signInWithPassword: vi.fn().mockResolvedValue(e) })).signIn({ email: "a@b.co", password: "longenoughpw" });
    await expect(run(fail("invalid_credentials", "Invalid login credentials"))).rejects.toMatchObject({ code: "invalid-credentials" });
    await expect(run(fail("email_not_confirmed", "Email not confirmed"))).rejects.toMatchObject({ code: "email-not-confirmed" });
  });
});

describe("email links", () => {
  it("resends the confirmation link", async () => {
    const c = client();
    await createAuthApi(c).resendConfirmation({ email: "a@b.co", redirectTo: "https://h.app/" });
    expect(c.auth.resend).toHaveBeenCalledWith({ type: "signup", email: "a@b.co", options: { emailRedirectTo: "https://h.app/" } });
  });

  it("requests a password reset link that comes back to the reset page", async () => {
    const c = client();
    await createAuthApi(c).requestPasswordReset({ email: "a@b.co", redirectTo: "https://h.app/reset-password" });
    expect(c.auth.resetPasswordForEmail).toHaveBeenCalledWith("a@b.co", { redirectTo: "https://h.app/reset-password" });
  });

  it("surfaces rate limits when sending", async () => {
    const c = client({ resetPasswordForEmail: vi.fn().mockResolvedValue({ error: { code: "over_email_send_rate_limit", message: "r", status: 429 } }) });
    await expect(createAuthApi(c).requestPasswordReset({ email: "a@b.co", redirectTo: "x" })).rejects.toMatchObject({ code: "rate-limited" });
  });
});

describe("updatePassword", () => {
  it("sets a new password for the signed-in person, then signs out their other sessions", async () => {
    const c = client();
    await createAuthApi(c).updatePassword("brand new password");
    expect(c.auth.updateUser).toHaveBeenCalledWith({ password: "brand new password" });
    expect(c.auth.signOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it("sends the emailed code with the new password", async () => {
    const c = client();
    await createAuthApi(c).updatePassword("brand new password", "123456");
    expect(c.auth.updateUser).toHaveBeenCalledWith({ password: "brand new password", nonce: "123456" });
  });

  it("says when the server wants the code first, or the code was wrong, and signs nobody out", async () => {
    const needs = client({ updateUser: vi.fn().mockResolvedValue({ error: { code: "reauthentication_needed", message: "x", status: 400 } }) });
    await expect(createAuthApi(needs).updatePassword("brand new password")).rejects.toMatchObject({ code: "reauthentication-needed" });
    expect(needs.auth.signOut).not.toHaveBeenCalled();
    const wrong = client({ updateUser: vi.fn().mockResolvedValue({ error: { code: "reauthentication_not_valid", message: "x", status: 400 } }) });
    await expect(createAuthApi(wrong).updatePassword("brand new password", "000000")).rejects.toMatchObject({ code: "invalid-code" });
  });

  it("asks the server to email the code", async () => {
    const c = client();
    await createAuthApi(c).requestCode();
    expect(c.auth.reauthenticate).toHaveBeenCalledTimes(1);
  });

  it("rejects a weak one without calling the server", async () => {
    const c = client();
    await expect(createAuthApi(c).updatePassword("tiny")).rejects.toMatchObject({ code: "weak-password" });
    expect(c.auth.updateUser).not.toHaveBeenCalled();
  });
});

describe("verifyEmailLink", () => {
  it("confirms the token from an emailed link, which signs the person in", async () => {
    const c = client();
    await createAuthApi(c).verifyEmailLink({ tokenHash: "abc123", type: "signup" });
    expect(c.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "abc123", type: "signup" });
  });

  it("reports a used or expired link as an invalid link", async () => {
    const c = client({ verifyOtp: vi.fn().mockResolvedValue({ error: { code: "otp_expired", message: "Email link is invalid or has expired", status: 403 } }) });
    await expect(createAuthApi(c).verifyEmailLink({ tokenHash: "x", type: "recovery" })).rejects.toMatchObject({ code: "invalid-link" });
  });
});

describe("the bot check token", () => {
  it("goes to the auth service with each request that has one, and is left out when there is none", async () => {
    const c = client();
    const api = createAuthApi(c);
    await api.signIn({ email: "a@b.co", password: "longenoughpw", captchaToken: "t1" });
    expect(c.auth.signInWithPassword).toHaveBeenCalledWith({ email: "a@b.co", password: "longenoughpw", options: { captchaToken: "t1" } });
    await api.signIn({ email: "a@b.co", password: "longenoughpw" });
    expect(c.auth.signInWithPassword).toHaveBeenLastCalledWith({ email: "a@b.co", password: "longenoughpw" });
    await api.requestPasswordReset({ email: "a@b.co", redirectTo: "r", captchaToken: "t2" });
    expect(c.auth.resetPasswordForEmail).toHaveBeenCalledWith("a@b.co", { redirectTo: "r", captchaToken: "t2" });
    await api.resendConfirmation({ email: "a@b.co", redirectTo: "r", captchaToken: "t3" });
    expect(c.auth.resend).toHaveBeenCalledWith({ type: "signup", email: "a@b.co", options: { emailRedirectTo: "r", captchaToken: "t3" } });
  });

  it("turns the service's refusal into a clear error", async () => {
    const c = client({ signInWithPassword: vi.fn().mockResolvedValue({ data: null, error: { code: "captcha_failed", message: "captcha verification process failed" } }) });
    await expect(createAuthApi(c).signIn({ email: "a@b.co", password: "longenoughpw" })).rejects.toMatchObject({ code: "captcha" });
  });
});
