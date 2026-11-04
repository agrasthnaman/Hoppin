import { describe, expect, it, vi } from "vitest";
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
