// Edge Function: sends the next batch of invite links to people waiting in the sign-up queue.
// Called once an hour by pg_cron (see supabase/ops/schedule-drain.sql and docs/signup-queue.md).
//
// Secrets (set as function secrets, never in the repo):
//   DRAIN_SECRET   shared secret the caller must send in the x-drain-secret header
//   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided to every Edge Function by Supabase
//   SITE_URL       optional, defaults to https://hoppinclub.com
//
// Deploy with --no-verify-jwt: the caller is the database itself and proves who it is with DRAIN_SECRET.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { authorized, drain, type QueueRow } from "./drain.ts";

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!authorized(request.headers.get("x-drain-secret"), Deno.env.get("DRAIN_SECRET"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return new Response("Not configured", { status: 500 });
  const site = (Deno.env.get("SITE_URL") ?? "https://hoppinclub.com").replace(/\/$/, "");
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const result = await drain({
      claim: async () => {
        const { data, error } = await admin.rpc("claim_signup_queue");
        if (error) throw new Error("claim failed");
        return (data ?? []) as QueueRow[];
      },
      invite: async (email, name) => {
        const { error } = await admin.auth.admin.inviteUserByEmail(email, {
          redirectTo: `${site}/`,
          data: name ? { display_name: name } : undefined,
        });
        return { error: error ? { status: error.status, code: error.code, message: error.message } : null };
      },
      mark: async (id, status, error) => {
        const { error: failed } = await admin.rpc("mark_signup_queue", { p_id: id, p_status: status, p_error: error });
        if (failed) throw new Error("mark failed");
      },
      log: (line) => console.log(line),
    });
    return Response.json(result);
  } catch {
    // Nothing about the people in the queue is ever put in a response or a log.
    console.log("drain failed before any invite was sent");
    return new Response("Failed", { status: 500 });
  }
});
