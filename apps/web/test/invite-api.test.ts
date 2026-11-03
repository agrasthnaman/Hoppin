import { describe, expect, it, vi } from "vitest";
import { createAuthApi } from "../src/lib/auth-api";
import { createInviteApi } from "../src/lib/invite-api";

function fakeRpc(data: unknown, error: { message: string } | null = null) {
  return { rpc: vi.fn().mockResolvedValue({ data, error }) };
}

describe("createInviteApi", () => {
  it("createInvite calls create_invite and returns id and token", async () => {
    const client = fakeRpc({ id: "inv1", token: "tok" });
    const api = createInviteApi(client);
    expect(await api.createInvite("trip1")).toEqual({ id: "inv1", token: "tok" });
    expect(client.rpc).toHaveBeenCalledWith("create_invite", { p_trip: "trip1" });
  });

  it("redeemInvite maps the result to camelCase", async () => {
    const client = fakeRpc({ trip_id: "trip1", status: "pending" });
    expect(await createInviteApi(client).redeemInvite("tok")).toEqual({ tripId: "trip1", status: "pending" });
    expect(client.rpc).toHaveBeenCalledWith("redeem_invite", { p_token: "tok" });
  });

  it("approve, remove and revoke call their functions", async () => {
    const client = fakeRpc(null);
    const api = createInviteApi(client);
    await api.approveMember("trip1", "u1");
    await api.removeMember("trip1", "u2");
    await api.revokeInvite("inv1");
    expect(client.rpc.mock.calls).toEqual([
      ["approve_member", { p_trip: "trip1", p_user: "u1" }],
      ["remove_member", { p_trip: "trip1", p_user: "u2" }],
      ["revoke_invite", { p_invite: "inv1" }],
    ]);
  });

  it("throws the database error message", async () => {
    const api = createInviteApi(fakeRpc(null, { message: "invalid or expired invite" }));
    await expect(api.redeemInvite("bad")).rejects.toThrow("invalid or expired invite");
  });
});

describe("createAuthApi", () => {
  it("sends a magic link carrying the name and redirect", async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
    await createAuthApi({ auth: { signInWithOtp } }).sendMagicLink({
      email: "neha@example.com",
      name: "Neha",
      redirectTo: "https://hoppin.app/join/tok",
    });
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "neha@example.com",
      options: { emailRedirectTo: "https://hoppin.app/join/tok", data: { display_name: "Neha" }, shouldCreateUser: true },
    });
  });

  it("throws when sending fails", async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error: { message: "rate limit" } });
    await expect(
      createAuthApi({ auth: { signInWithOtp } }).sendMagicLink({ email: "a@b.co", name: "A", redirectTo: "x" }),
    ).rejects.toThrow("rate limit");
  });
});

describe("createAuthApi.signIn", () => {
  it("emails a sign-in link to existing accounts only", async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
    await createAuthApi({ auth: { signInWithOtp } }).signIn({ email: "a@b.co", redirectTo: "https://hoppin.app/" });
    expect(signInWithOtp).toHaveBeenCalledWith({ email: "a@b.co", options: { emailRedirectTo: "https://hoppin.app/", shouldCreateUser: false } });
  });
});
