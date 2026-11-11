// Edge Function: turns each trip's closed 5-minute window of changes into one digest per member, saved for the app
// and emailed with Resend. Called every 5 minutes by pg_cron (see supabase/ops/schedule-digest.sql).
//
// Secrets (set as function secrets, never in the repo):
//   DIGEST_SECRET  shared secret the caller must send in the x-digest-secret header
//   RESEND_API_KEY Resend API key; without it digests are still saved for the app, and no email is sent
//   FCM_SERVICE_ACCOUNT  Firebase service-account JSON; without it no phone notification is sent
//   DIGEST_FROM    sender, e.g. "Hoppin <updates@hoppinclub.com>" (a domain verified in Resend)
//   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided to every Edge Function by Supabase
//   SITE_URL       optional, defaults to https://hoppinclub.com
//
// Deploy with --no-verify-jwt: the caller is the database itself and proves who it is with DIGEST_SECRET.
import { createClient } from "npm:@supabase/supabase-js@2";
import { authorized } from "../drain-signup-queue/drain.ts";
import { fcmAccessToken, postFcm, readServiceAccount } from "../send-push/fcm.ts";
import { sendDigests, WINDOW_MS, type Email, type PushTarget, type TripBatch } from "./run.ts";

const MAX_TRIPS = 50;
const MAX_ENTRIES = 500;

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!authorized(request.headers.get("x-digest-secret"), Deno.env.get("DIGEST_SECRET"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return new Response("Not configured", { status: 500 });
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fcmAccount = readServiceAccount(Deno.env.get("FCM_SERVICE_ACCOUNT") ?? "");
  const from = Deno.env.get("DIGEST_FROM") ?? "Hoppin <updates@hoppinclub.com>";
  const site = (Deno.env.get("SITE_URL") ?? "https://hoppinclub.com").replace(/\/$/, "");
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const result = await sendDigests({
      claim: async () => {
        const { data, error } = await admin.rpc("claim_digest_batch", {
          p_window_seconds: WINDOW_MS / 1000,
          p_max_trips: MAX_TRIPS,
          p_max_entries: MAX_ENTRIES,
        });
        if (error) throw new Error("claim failed");
        return (data ?? []) as TripBatch[];
      },
      record: async (tripId, fromId, throughId, windowStart, rows) => {
        const { data, error } = await admin.rpc("record_digests", {
          p_trip: tripId,
          p_from_id: fromId,
          p_through_id: throughId,
          p_window_start: windowStart,
          p_rows: rows,
        });
        if (error) throw new Error("record failed");
        return data === true;
      },
      defer: async (tripId, fromId) => {
        const { error } = await admin.rpc("defer_digest", { p_trip: tripId, p_from_id: fromId });
        if (error) throw new Error("defer failed");
      },
      pushTargets: fcmAccount
        ? async (tripId) => {
            const { data, error } = await admin.rpc("push_targets", { p_trip: tripId });
            if (error) throw new Error("push targets failed");
            return (Array.isArray(data) ? data : []).filter((row): row is PushTarget => {
              if (typeof row !== "object" || row === null) return false;
              return "user_id" in row && typeof row.user_id === "string"
                && "token" in row && typeof row.token === "string"
                && "platform" in row && (row.platform === "ios" || row.platform === "android");
            });
          }
        : undefined,
      sendPushes: fcmAccount
        ? async (notes) => {
            const access = await fcmAccessToken(fcmAccount, fetch);
            for (const note of notes) {
              const response = await postFcm(fcmAccount.project_id, access, note, fetch);
              if (!response.ok) throw new Error(`fcm ${response.status}`);
            }
          }
        : undefined,
      sendEmails: async (emails: Email[]) => {
        if (!resendKey) return;
        // Resend takes up to 100 emails per batch call.
        for (let i = 0; i < emails.length; i += 100) {
          const response = await fetch("https://api.resend.com/emails/batch", {
            method: "POST",
            headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify(emails.slice(i, i + 100).map((e) => ({ from, to: [e.to], subject: e.subject, html: e.html, text: e.text }))),
          });
          if (!response.ok) throw new Error(`resend ${response.status}`);
        }
      },
      siteUrl: site,
      log: (line) => console.log(line),
    });
    return Response.json(result);
  } catch {
    console.log("digest run failed before any trip was handled");
    return new Response("Failed", { status: 500 });
  }
});
