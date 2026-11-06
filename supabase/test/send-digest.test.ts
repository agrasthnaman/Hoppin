import { describe, expect, it, vi } from "vitest";
import { digestEmail, sendDigests, type SendDeps, type StoredChange, type TripBatch } from "../functions/send-digest/run";

const hotel = { id: "stay", kind: "stay", title: "Beach hotel", starts_at: "2026-12-01T08:30:00Z", ends_at: null, tz: "Asia/Kolkata", location_url: null, details: {} };
const T = "2026-12-01T08:00:00Z";

function batch(over: Partial<TripBatch> = {}): TripBatch {
  return {
    trip_id: "goa",
    trip_name: "Goa",
    through_id: 10,
    entries: [
      { id: 11, item_id: "stay", actor_id: "org", op: "update", changed_at: T, before: hotel, after: { ...hotel, title: "Sea view hotel" }, item_visibility: "shared", item_owner_id: "org" },
    ],
    recipients: [
      { user_id: "org", email: "org@example.com", display_name: "Aman" },
      { user_id: "alice", email: "alice@example.com", display_name: "Alice" },
      { user_id: "bob", email: null, display_name: "Bob" },
    ],
    ...over,
  };
}

function deps(batches: TripBatch[], over: Partial<SendDeps> = {}) {
  const lines: string[] = [];
  const base = {
    claim: vi.fn<SendDeps["claim"]>(async () => batches),
    record: vi.fn<SendDeps["record"]>(async () => true),
    sendEmails: vi.fn<SendDeps["sendEmails"]>(async () => {}),
    siteUrl: "https://hoppinclub.com",
    log: (line: string) => void lines.push(line),
  };
  return { d: { ...base, ...over } as typeof base, lines };
}

describe("sendDigests", () => {
  it("records one digest per member who may see the change, and emails those with email on", async () => {
    const { d } = deps([batch()]);
    const result = await sendDigests(d);
    expect(result).toEqual({ trips: 1, notified: 2, emailed: 1, failedTrips: 0 });
    const [trip, from, through, windowStart, rows] = d.record.mock.calls[0]!;
    expect([trip, from, through, windowStart]).toEqual(["goa", 10, 11, T.replace("Z", ".000Z")]);
    expect(rows.map((r) => r.user_id)).toEqual(["alice", "bob"]); // not the organizer, who made the change
    expect(rows[0]!.changes[0]).toMatchObject({ title: "Sea view hotel", byNames: ["Aman"] });
    const [emails] = d.sendEmails.mock.calls[0]!;
    expect(emails.map((e) => e.to)).toEqual(["alice@example.com"]);
    expect(emails[0]!.subject).toBe("1 change in Goa");
  });

  it("sends nothing when another run already recorded the batch", async () => {
    const { d } = deps([batch()], { record: vi.fn<SendDeps["record"]>(async () => false) });
    expect(await sendDigests(d)).toMatchObject({ notified: 0, emailed: 0 });
    expect(d.sendEmails).not.toHaveBeenCalled();
  });

  it("moves the trip on even when nobody else may see the changes", async () => {
    const { d } = deps([batch({ entries: [{ ...batch().entries[0]!, item_visibility: "private" }] })]);
    await sendDigests(d);
    expect(d.record.mock.calls[0]![2]).toBe(11);
    expect(d.record.mock.calls[0]![4]).toEqual([]);
  });

  it("one trip failing leaves it waiting and the others still go out", async () => {
    let first = true;
    const record = vi.fn<SendDeps["record"]>(async () => {
      if (first) {
        first = false;
        throw new Error("down");
      }
      return true;
    });
    const { d, lines } = deps([batch(), batch({ trip_id: "manali" })], { record });
    expect(await sendDigests(d)).toMatchObject({ trips: 2, failedTrips: 1, notified: 2 });
    expect(lines.join("\n")).not.toMatch(/@|Goa|hotel|Alice/); // logs never carry personal details
  });

  it("a failed email does not undo the saved digests", async () => {
    const { d } = deps([batch()], { sendEmails: vi.fn<SendDeps["sendEmails"]>(async () => Promise.reject(new Error("resend 500"))) });
    expect(await sendDigests(d)).toMatchObject({ notified: 2, emailed: 0, failedTrips: 0 });
  });
});

describe("digestEmail", () => {
  const change = (title: string): StoredChange => ({ itemId: "x", op: "added", title, kind: "plan", tz: "UTC", startsAt: null, fields: [], by: ["a"], at: T, byNames: ["<b>Eve</b>"] });

  it("escapes everything people typed, and keeps the subject on one line", () => {
    const email = digestEmail("Goa\r\nBcc: x@evil.test", "https://hoppinclub.com/trips/goa", [change(`<script>alert(1)</script>`)]);
    expect(email.subject).toBe("1 change in Goa Bcc: x@evil.test");
    expect(email.subject).not.toMatch(/[\r\n]/);
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).not.toContain("<b>Eve</b>");
    expect(email.text).toContain("https://hoppinclub.com/trips/goa/updates");
  });

  it("lists at most 20 changes and says how many more", () => {
    const email = digestEmail("Goa", "https://x", Array.from({ length: 23 }, (_, i) => change(`Plan ${i}`)));
    expect(email.subject).toBe("23 changes in Goa");
    expect(email.text).toContain("and 3 more");
    expect(email.text).not.toContain("Plan 20");
  });
});
