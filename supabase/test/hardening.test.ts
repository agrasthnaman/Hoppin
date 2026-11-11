import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { asUser, id, seededDb } from "./helpers";

let db: PGlite;
beforeEach(async () => {
  db = await seededDb();
});

/** Runs a statement as the public API key (role `anon`: not signed in) and returns the error text, or null if it worked. */
async function asAnon(sql: string): Promise<string | null> {
  try {
    await db.transaction(async (tx) => {
      await tx.exec("set local role anon");
      await tx.exec(sql);
    });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function asPerson(userId: string, sql: string): Promise<string | null> {
  try {
    await asUser(db, userId, (tx) => tx.exec(sql));
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

const TABLES = ["trips", "members", "items", "rsvps", "documents", "change_log", "profiles", "invites", "polls", "poll_options", "poll_votes", "expenses", "expense_shares", "trip_guests", "notifications", "push_tokens"];

describe("the public API key (not signed in)", () => {
  it.each(TABLES)("cannot even look at %s", async (table) => {
    expect(await asAnon(`select * from ${table}`)).toMatch(/permission denied/);
  });

  it("cannot write anything", async () => {
    expect(await asAnon(`insert into trips (name, created_by) values ('x', '${id.alice}')`)).toMatch(/permission denied/);
    expect(await asAnon(`delete from items`)).toMatch(/permission denied/);
    expect(await asAnon(`truncate items`)).toMatch(/permission denied/);
  });

  it("can call only the two sign-up queue functions", async () => {
    for (const call of [
      "select create_trip('x')",
      "select delete_my_account()",
      "select approve_member('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002')",
      "select is_approved_member('00000000-0000-0000-0000-0000000000a1')",
      "select redeem_invite('abc')",
    ]) {
      expect(await asAnon(call), call).toMatch(/permission denied/);
    }
    expect(await asAnon("select signup_queue_status('someone@example.com')")).toBeNull();
    expect(await asAnon("select join_signup_queue('someone@example.com', 'Someone')")).toMatch(/permission denied/);
  });
});

describe("signed-in people", () => {
  it("cannot truncate or change the structure of any table", async () => {
    for (const table of TABLES) expect(await asPerson(id.organizer, `truncate ${table}`), table).toMatch(/permission denied/);
  });

  it("cannot write straight into the tables that are written only through functions", async () => {
    expect(await asPerson(id.alice, `insert into polls (trip_id, question) values ('${id.trip}', 'q')`)).toMatch(/permission denied/);
    expect(await asPerson(id.alice, `insert into expenses (trip_id) values ('${id.trip}')`)).toMatch(/permission denied/);
    expect(await asPerson(id.alice, `insert into members (trip_id, user_id) values ('${id.otherTrip}', '${id.alice}')`)).toMatch(/permission denied/);
    expect(await asPerson(id.alice, `insert into notifications (trip_id, user_id, window_start, changes) values ('${id.trip}', '${id.alice}', now(), '[]')`)).toMatch(/permission denied/);
  });

  it("cannot call the functions that only the scheduled jobs use", async () => {
    for (const call of ["select claim_signup_queue()", "select claim_digest_batch(300, 10, 100)", "select purge_old_invites(30)", `select expense_snapshot('${id.trip}')`]) {
      expect(await asPerson(id.organizer, call), call).toMatch(/permission denied/);
    }
  });

  it("can still do what the app needs", async () => {
    expect(await asPerson(id.alice, `insert into trip_guests (id, trip_id, name, added_by) values (gen_random_uuid(), '${id.trip}', 'Meera', '${id.alice}')`)).toBeNull();
    expect(await asPerson(id.alice, `insert into rsvps (item_id, user_id) values ('${id.stay}', '${id.alice}')`)).toBeNull();
    expect(await asPerson(id.alice, `update profiles set display_name = 'Alice' where user_id = '${id.alice}'`)).toBeNull();
  });
});

describe("limits on what can be stored", () => {
  const item = (over: string) =>
    `insert into items (trip_id, owner_id, kind, visibility, group_item, starts_at, tz, title${over ? ", location_url" : ""}) values ('${id.trip}', '${id.alice}', 'plan', 'shared', false, now(), 'Asia/Kolkata', 'Lunch'${over ? `, '${over}'` : ""})`;

  it("only accepts a web address as a plan's link", async () => {
    expect(await asPerson(id.alice, item("https://maps.example/lunch"))).toBeNull();
    expect(await asPerson(id.alice, item("http://maps.example/lunch"))).toBeNull();
    for (const bad of ["javascript:alert(1)", "data:text/html,<script>1</script>", "ftp://x.example/a", "https://x.example/a b", "//evil.example"]) {
      expect(await asPerson(id.alice, item(bad)), bad).toMatch(/items_location_url_web/);
    }
    expect(await asPerson(id.alice, item(`https://x.example/${"a".repeat(2000)}`))).toMatch(/items_location_url_web/);
  });

  it("refuses oversized text and details", async () => {
    expect(await asPerson(id.alice, `insert into items (trip_id, owner_id, kind, visibility, group_item, starts_at, tz, title) values ('${id.trip}', '${id.alice}', 'plan', 'shared', false, now(), 'Asia/Kolkata', '${"t".repeat(201)}')`)).toMatch(/items_title_length/);
    expect(await asPerson(id.alice, `insert into items (trip_id, owner_id, kind, visibility, group_item, starts_at, tz, title, details) values ('${id.trip}', '${id.alice}', 'plan', 'shared', false, now(), 'Asia/Kolkata', 'x', jsonb_build_object('notes', '${"n".repeat(25000)}'))`)).toMatch(/items_details_size/);
    expect(await asPerson(id.alice, `insert into trip_guests (id, trip_id, name, added_by) values (gen_random_uuid(), '${id.trip}', '${"g".repeat(41)}', '${id.alice}')`)).toMatch(/trip_guests_name_check/);
  });
});
