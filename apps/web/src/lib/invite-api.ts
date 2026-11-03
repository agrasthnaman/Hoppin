import type { InviteApi, MembershipStatus } from "@hoppin/core";

/** The slice of the Supabase client used here, so it can be faked in tests. */
export interface RpcClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

async function call(client: RpcClient, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

export function createInviteApi(client: RpcClient): InviteApi {
  return {
    async createInvite(tripId) {
      const data = (await call(client, "create_invite", { p_trip: tripId })) as { id: string; token: string };
      return { id: data.id, token: data.token };
    },
    async revokeInvite(inviteId) {
      await call(client, "revoke_invite", { p_invite: inviteId });
    },
    async redeemInvite(token) {
      const data = (await call(client, "redeem_invite", { p_token: token })) as { trip_id: string; status: MembershipStatus };
      return { tripId: data.trip_id, status: data.status };
    },
    async approveMember(tripId, userId) {
      await call(client, "approve_member", { p_trip: tripId, p_user: userId });
    },
    async removeMember(tripId, userId) {
      await call(client, "remove_member", { p_trip: tripId, p_user: userId });
    },
  };
}
