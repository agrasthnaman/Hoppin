// Edge Function: the only way into the sign-up queue. The sign-up form calls it when the email service is over its
// limit; it checks the Turnstile bot-check token, then saves the spot as the service role.
//
// Secrets (set as function secrets, never in the repo):
//   TURNSTILE_SECRET_KEY  the same Turnstile secret Supabase Auth uses; without it nobody can join the queue
//   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided to every Edge Function by Supabase
//
// Deploy with --no-verify-jwt: callers are not signed in, and the bot check is what is verified.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { joinQueue, verifyTurnstile, type JoinStatus } from "./join.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!url || !serviceKey || !secret) return new Response("Not configured", { status: 503, headers: CORS });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const body: unknown = await request.json().catch(() => null);
  const answer = await joinQueue(body, {
    verifyCaptcha: (token) => verifyTurnstile(secret, token, fetch),
    join: async (email, name) => {
      const { data, error } = await admin.rpc("join_signup_queue", { p_email: email, p_name: name });
      if (error) throw new Error("join failed");
      return (data as { status: JoinStatus }).status;
    },
  });
  return Response.json(answer.body, { status: answer.status, headers: CORS });
});
