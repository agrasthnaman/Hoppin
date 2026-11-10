import type { PushNote } from "./fcm.ts";

/** A note the owner can send to one person's phones, to prove delivery. It opens the app. */
export function testPush(token: string): PushNote {
  return { token, title: "Hoppin", body: "Notifications are on.", url: "https://hoppinclub.com/" };
}

export async function sendTestPush(deps: {
  authorized: boolean;
  configured: boolean;
  tokens: string[];
  send(note: PushNote): Promise<void>;
}): Promise<{ status: number; body: string }> {
  if (!deps.authorized) return { status: 401, body: "Unauthorized" };
  if (!deps.configured) return { status: 503, body: "Push is not configured" };
  if (deps.tokens.length === 0) return { status: 404, body: "No tokens" };
  for (const token of deps.tokens) await deps.send(testPush(token));
  return { status: 200, body: `sent ${deps.tokens.length}` };
}
