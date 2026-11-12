// Edge Function: sends one test notification to every token of one user.
// The owner calls it with the same x-digest-secret as the digest job.
//
// Secrets (never in the repo):
//   DIGEST_SECRET          shared secret
//   FCM_SERVICE_ACCOUNT    Firebase service-account JSON. Without it the function returns 503.
//   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
//
// Deploy with --no-verify-jwt. Body: { "user_id": "<uuid>" }
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { authorized } from "../drain-signup-queue/drain.ts";
import { fcmAccessToken, postFcm, readServiceAccount } from "./fcm.ts";
import { sendTestPush } from "./run.ts";

const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const account = readServiceAccount(Deno.env.get("FCM_SERVICE_ACCOUNT") ?? "");
  const ok = authorized(request.headers.get("x-digest-secret"), Deno.env.get("DIGEST_SECRET"));
  let tokens: string[] = [];
  if (ok && account) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = null;
    }
    const userId = typeof body === "object" && body !== null && "user_id" in body && typeof body.user_id === "string" ? body.user_id : "";
    if (!USER_ID.test(userId)) return new Response("Bad request", { status: 400 });
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return new Response("Not configured", { status: 500 });
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await admin.from("push_tokens").select("token").eq("user_id", userId);
    if (error) return new Response("Failed", { status: 500 });
    tokens = (Array.isArray(data) ? data : []).flatMap((row) =>
      typeof row === "object" && row !== null && "token" in row && typeof row.token === "string" && row.token.length > 0 ? [row.token] : [],
    );
  }
  const result = await sendTestPush({
    authorized: ok,
    configured: account !== null,
    tokens,
    send: async (note) => {
      if (!account) return;
      const access = await fcmAccessToken(account, fetch);
      const response = await postFcm(account.project_id, access, note, fetch);
      if (!response.ok) throw new Error(`fcm ${response.status}`);
    },
  });
  return new Response(result.body, { status: result.status });
});
