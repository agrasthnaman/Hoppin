// The decisions of the hourly sign-up queue job, with no Supabase or Deno in them so they can be tested directly.
// index.ts wires these to the real database and the real invite email.

export interface QueueRow {
  id: string;
  email: string;
  display_name: string | null;
}

export interface InviteResult {
  error: { status?: number; code?: string; message: string } | null;
}

export interface DrainDeps {
  /** Up to one batch of the oldest waiting people (nothing when paused or empty). Throws if the database cannot be reached. */
  claim(): Promise<QueueRow[]>;
  /** Sends one invite link. Returns the error instead of throwing. */
  invite(email: string, name: string | null): Promise<InviteResult>;
  /**
   * 'invited' / 'skipped': done. 'waiting' with an error: try again next run and remember why.
   * 'waiting' with no error: hand the person back untouched (the email service told us to stop).
   */
  mark(id: string, status: "invited" | "skipped" | "waiting", error: string | null): Promise<void>;
  /** Only counts and fixed words are ever passed here, never an email address. */
  log(line: string): void;
}

export interface DrainResult {
  claimed: number;
  invited: number;
  skipped: number;
  /** Left in the queue for the next run (including everyone after a stop). */
  deferred: number;
  /** True when the email service said it was over its limit and the batch stopped early. */
  stoppedByLimit: boolean;
}

const EMAIL_IN_TEXT = /[^\s@<>"']+@[^\s@<>"']+/g;

/** Error text with any email address removed, so it is safe to store and to log. */
export function scrub(text: string): string {
  return text.replace(EMAIL_IN_TEXT, "[email]").slice(0, 200);
}

export function isRateLimit(e: { status?: number; code?: string; message: string }): boolean {
  return e.status === 429 || e.code === "over_email_send_rate_limit" || e.code === "over_request_rate_limit" || /rate limit/i.test(e.message);
}

export function isAlreadyRegistered(e: { status?: number; code?: string; message: string }): boolean {
  return e.code === "email_exists" || e.code === "user_already_exists" || /already (been )?registered|already exists/i.test(e.message);
}

/** Compares the shared secret without stopping at the first wrong character. An empty secret never matches. */
export function authorized(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!expected || !provided) return false;
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export async function drain(deps: DrainDeps): Promise<DrainResult> {
  const rows = await deps.claim();
  const result: DrainResult = { claimed: rows.length, invited: 0, skipped: 0, deferred: 0, stoppedByLimit: false };
  if (rows.length === 0) {
    deps.log("queue empty or paused: nothing sent");
    return result;
  }

  // A failure to record the outcome must not stop the rest. The claim expires by itself after 15 minutes.
  const mark = async (id: string, status: "invited" | "skipped" | "waiting", error: string | null) => {
    try {
      await deps.mark(id, status, error);
    } catch {
      deps.log("could not record an outcome");
    }
  };

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]!;
    const { error } = await deps.invite(row.email, row.display_name);
    if (!error) {
      await mark(row.id, "invited", null);
      result.invited += 1;
    } else if (isRateLimit(error)) {
      // Stop right here. This person and everyone after them go back untouched and are tried next run.
      result.stoppedByLimit = true;
      for (const rest of rows.slice(i)) {
        await mark(rest.id, "waiting", null);
        result.deferred += 1;
      }
      break;
    } else if (isAlreadyRegistered(error)) {
      await mark(row.id, "skipped", null);
      result.skipped += 1;
    } else {
      await mark(row.id, "waiting", scrub(error.message));
      result.deferred += 1;
    }
  }

  deps.log(
    `claimed ${result.claimed}, invited ${result.invited}, skipped ${result.skipped}, left waiting ${result.deferred}` +
      (result.stoppedByLimit ? ", stopped: email limit reached" : ""),
  );
  return result;
}
