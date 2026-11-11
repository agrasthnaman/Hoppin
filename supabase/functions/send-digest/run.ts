// The decisions of the 5-minute notification job, with no Supabase or Deno in them so they can be tested directly.
// index.ts wires these to the real database and to Resend.
import { buildDigest, describeChange, takeWindow, type ChangeLogEntry, type NotifiedChange } from "../../../packages/core/src/digest.ts";

export const WINDOW_MS = 5 * 60_000;
const MAX_EMAIL_CHANGES = 20;

/** One trip as `claim_digest_batch` hands it out (snake_case, straight from the database). */
export interface TripBatch {
  trip_id: string;
  trip_name: string;
  through_id: number;
  entries: {
    id: number;
    item_id: string | null;
    actor_id: string | null;
    op: ChangeLogEntry["op"];
    changed_at: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    item_visibility: ChangeLogEntry["itemVisibility"];
    item_owner_id: string | null;
  }[];
  /** Approved members. `email` is null when the person turned email off. */
  recipients: { user_id: string; email: string | null; display_name: string | null }[];
}

export type StoredChange = NotifiedChange;

export interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface PushTarget {
  user_id: string;
  token: string;
  platform: "ios" | "android";
}

export interface PushNote {
  token: string;
  title: string;
  body: string;
  url: string;
}

export interface SendDeps {
  claim(): Promise<TripBatch[]>;
  /** False when another run already recorded this batch: nothing may be sent then. */
  record(tripId: string, fromId: number, throughId: number, windowStart: string, rows: { user_id: string; changes: StoredChange[] }[]): Promise<boolean>;
  /** A trip could not be handled: the database tries it again later, so it does not hold up the other trips. */
  defer(tripId: string, fromId: number): Promise<void>;
  /** Sends a trip's emails in one call. Throws on failure. */
  sendEmails(emails: Email[]): Promise<void>;
  /** Tokens for members who turned phone updates on. Absent when push is not configured. */
  pushTargets?(tripId: string): Promise<PushTarget[]>;
  /** Sends one trip's phone notifications. Throws on failure. Best effort, like email. */
  sendPushes?(notes: PushNote[]): Promise<void>;
  siteUrl: string;
  /** Only counts and fixed words are ever passed here, never a name, title or address. */
  log(line: string): void;
}

export interface SendResult {
  trips: number;
  notified: number;
  emailed: number;
  pushed: number;
  failedTrips: number;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** Header-safe: no line breaks, bounded length. */
const oneLine = (s: string, max: number) => s.replace(/[\r\n\t]+/g, " ").trim().slice(0, max);

export function toEntry(tripId: string, row: TripBatch["entries"][number]): ChangeLogEntry {
  return {
    id: row.id,
    tripId,
    itemId: row.item_id,
    actorId: row.actor_id,
    op: row.op,
    changedAt: new Date(row.changed_at).toISOString(),
    before: row.before,
    after: row.after,
    itemVisibility: row.item_visibility,
    itemOwnerId: row.item_owner_id,
  };
}

export function digestEmail(tripName: string, tripUrl: string, changes: StoredChange[]): Omit<Email, "to"> {
  const name = oneLine(tripName, 80);
  const subject = `${changes.length === 1 ? "1 change" : `${changes.length} changes`} in ${name}`;
  const shown = changes.slice(0, MAX_EMAIL_CHANGES);
  const more = changes.length - shown.length;
  const parts = shown.map((c) => {
    const { headline, lines } = describeChange(c);
    const by = c.byNames.length > 0 ? ` (by ${c.byNames.join(", ")})` : "";
    return { headline: headline + by, lines };
  });

  const text = [
    `What changed in ${name}:`,
    "",
    ...parts.flatMap((p) => [`- ${p.headline}`, ...p.lines.map((l) => `    ${l}`)]),
    ...(more > 0 ? [`- and ${more} more`] : []),
    "",
    `Open the trip: ${tripUrl}`,
    `To stop these emails, open ${tripUrl}/updates and turn off "Email me updates".`,
  ].join("\n");

  const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1f2937;line-height:1.5">
<p style="font-size:16px;font-weight:600">What changed in ${escapeHtml(name)}</p>
<ul style="padding-left:20px">${parts
    .map((p) => `<li style="margin-bottom:8px"><strong>${escapeHtml(p.headline)}</strong>${p.lines.map((l) => `<br><span style="color:#4b5563">${escapeHtml(l)}</span>`).join("")}</li>`)
    .join("")}${more > 0 ? `<li>and ${more} more</li>` : ""}</ul>
<p><a href="${escapeHtml(tripUrl)}/updates" style="color:#0f766e;font-weight:600">See all updates</a></p>
<p style="font-size:12px;color:#6b7280">You get this because you are in ${escapeHtml(name)} on Hoppin. To stop these emails, open the trip's Updates page and turn off "Email me updates".</p>
</body></html>`;
  return { subject, html, text };
}

/** One run: every trip whose window has closed gets its digests recorded, then emailed. One trip failing never stops the rest. */
export async function sendDigests(deps: SendDeps): Promise<SendResult> {
  const batches = await deps.claim();
  const result: SendResult = { trips: batches.length, notified: 0, emailed: 0, pushed: 0, failedTrips: 0 };

  for (const batch of batches) {
    try {
      const entries = takeWindow(batch.entries.map((row) => toEntry(batch.trip_id, row)), WINDOW_MS);
      const throughId = entries.at(-1)?.id ?? batch.through_id;
      const windowStart = entries[0]?.changedAt ?? new Date().toISOString();
      const names = new Map(batch.recipients.map((r) => [r.user_id, r.display_name ?? "Someone"]));

      const rows: { user_id: string; changes: StoredChange[] }[] = [];
      const emails: Email[] = [];
      const tripUrl = `${deps.siteUrl}/trips/${encodeURIComponent(batch.trip_id)}`;
      for (const person of batch.recipients) {
        const digest = buildDigest(entries, person.user_id, WINDOW_MS);
        if (!digest) continue;
        const changes = digest.changes.map((c) => ({ ...c, byNames: c.by.map((id) => names.get(id) ?? "Someone") }));
        rows.push({ user_id: person.user_id, changes });
        if (person.email) emails.push({ to: person.email, ...digestEmail(batch.trip_name, tripUrl, changes) });
      }

      if (!(await deps.record(batch.trip_id, batch.through_id, throughId, windowStart, rows))) {
        deps.log("a trip was already handled by another run");
        continue;
      }
      result.notified += rows.length;
      if (emails.length > 0) {
        try {
          await deps.sendEmails(emails);
          result.emailed += emails.length;
        } catch {
          // The in-app digests are saved; email is best effort and is not retried, so nobody gets it twice.
          deps.log("emails for a trip could not be sent");
        }
      }
      if (deps.pushTargets && deps.sendPushes) {
        try {
          const wanted = new Set(rows.map((row) => row.user_id));
          const counts = new Map(rows.map((row) => [row.user_id, row.changes.length]));
          const notes = (await deps.pushTargets(batch.trip_id))
            .filter((target) => wanted.has(target.user_id))
            .map((target) => {
              const n = counts.get(target.user_id) ?? 0;
              return {
                token: target.token,
                title: oneLine(batch.trip_name, 80),
                body: n === 1 ? "1 change in the plan" : `${n} changes in the plan`,
                url: `${tripUrl}/days`,
              };
            });
          if (notes.length > 0) {
            await deps.sendPushes(notes);
            result.pushed += notes.length;
          }
        } catch {
          deps.log("pushes for a trip could not be sent");
        }
      }
    } catch {
      result.failedTrips += 1;
      deps.log("a trip could not be processed; it is tried again later");
      await deps.defer(batch.trip_id, batch.through_id).catch(() => deps.log("a failed trip could not be put back for later"));
    }
  }
  deps.log(`trips ${result.trips}, notified ${result.notified}, emailed ${result.emailed}, pushed ${result.pushed}, failed ${result.failedTrips}`);
  return result;
}
