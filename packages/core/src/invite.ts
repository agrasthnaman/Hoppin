import type { MembershipStatus } from "./types";

export interface RedeemResult {
  tripId: string;
  status: MembershipStatus;
}

/** Invite and membership operations. The web app implements this on top of the database functions. */
export interface InviteApi {
  /** Organizer only. Returns the secret token to put in the link. */
  createInvite(tripId: string): Promise<{ id: string; token: string }>;
  revokeInvite(inviteId: string): Promise<void>;
  /** Signed-in user joins through a link: becomes pending (existing members keep their status). */
  redeemInvite(token: string): Promise<RedeemResult>;
  approveMember(tripId: string, userId: string): Promise<void>;
  removeMember(tripId: string, userId: string): Promise<void>;
}

/** The shareable join link for an invite token. */
export function inviteUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/join/${token}`;
}

/** Finds an invite token in a pasted link, a path, or a bare token. Returns null if there is none. */
export function parseInviteToken(input: string): string | null {
  const text = input.trim().split(/[?#]/)[0] ?? "";
  const last = text.split("/").filter(Boolean).pop() ?? "";
  return /^[0-9a-f]{64}$/i.test(last) ? last.toLowerCase() : null;
}
