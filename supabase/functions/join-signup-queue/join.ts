// The decisions of the sign-up queue's front door, with no Supabase or Deno in them so they can be tested directly.
// index.ts wires these to Cloudflare Turnstile and the database.

export type JoinStatus = "queued" | "already_queued" | "registered" | "full";

export interface JoinDeps {
  /** Asks Cloudflare whether a bot-check token is good. Each token works once. */
  verifyCaptcha(token: string): Promise<boolean>;
  /** join_signup_queue as the service role. Throws if the database refuses or cannot be reached. */
  join(email: string, name: string | null): Promise<JoinStatus>;
}

export interface Answer {
  status: number;
  body: { status: JoinStatus } | { error: "bad-request" | "captcha" | "failed" };
}

/**
 * Saves a spot only for someone who passed the bot check. Putting an email in the queue makes the hourly job send it an
 * invite, so without the check anyone with the public key could fill the queue with other people's addresses.
 */
export async function joinQueue(body: unknown, deps: JoinDeps): Promise<Answer> {
  const input = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const { email, name, captchaToken } = input;
  if (typeof email !== "string" || typeof captchaToken !== "string" || captchaToken === "" || !(name == null || typeof name === "string")) {
    return { status: 400, body: { error: "bad-request" } };
  }
  if (!(await deps.verifyCaptcha(captchaToken))) return { status: 403, body: { error: "captcha" } };
  try {
    return { status: 200, body: { status: await deps.join(email, name ?? null) } };
  } catch {
    return { status: 500, body: { error: "failed" } };
  }
}

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Cloudflare's answer for one token. Anything but a clear yes is a no. */
export async function verifyTurnstile(secret: string, token: string, fetcher: typeof fetch): Promise<boolean> {
  const response = await fetcher(SITEVERIFY, { method: "POST", body: new URLSearchParams({ secret, response: token }) });
  if (!response.ok) return false;
  const result: unknown = await response.json();
  return typeof result === "object" && result !== null && "success" in result && result.success === true;
}
