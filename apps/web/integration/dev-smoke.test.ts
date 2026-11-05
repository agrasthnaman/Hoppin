import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ItemFormValues } from "../src/components/ItemForm";
import { createServices } from "../src/app/services";
import { createDocumentSource } from "../src/data/document-source";
import { createTripSource } from "../src/data/trip-source";
import { ConflictError, createItem, deleteItem, setRsvp, updateItem } from "../src/data/writes";
import { getDocumentUrl, uploadDocument } from "../src/lib/documents";
import { createInviteApi } from "../src/lib/invite-api";
import { getDeviceKey } from "../src/offline/crypto";
import { openOfflineDb } from "../src/offline/db";
import { flushOutbox, listDrafts, listNotices, listOutbox, queueCreate, queueItemEdit, queueRsvp, type Writer } from "../src/offline/outbox";
import { cacheDocuments, getLocalDocument, getLocalTrip, syncTrip } from "../src/offline/sync";

// Leaves a few throwaway rows in the dev project. Clean up with:
//   delete from auth.users where email like 'smoke-%@example.invalid';   (trips, items and files cascade or can be deleted by trip)
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const run = Boolean(url && anon);

const stamp = Date.now();
const password = `Pw-${stamp}-x!`;
const newClient = () => createClient(url!, anon!, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

/**
 * Two ways to get a signed-in user: sign in as a pre-made test user (SMOKE_PASSWORD plus SMOKE_EMAIL_ALICE and
 * SMOKE_EMAIL_BOB in the environment), or sign up a new one (needs "Confirm email" off in the dev project).
 */
async function signInAs(client: SupabaseClient, label: "alice" | "bob") {
  const premade = process.env[`SMOKE_EMAIL_${label.toUpperCase()}`];
  if (premade) {
    const { data, error } = await client.auth.signInWithPassword({ email: premade, password: process.env.SMOKE_PASSWORD ?? "" });
    if (error || !data.user) throw new Error(`sign in failed: ${error?.message}`);
    return data.user.id;
  }
  const email = `smoke-${stamp}-${label}@example.invalid`;
  const { data, error } = await client.auth.signUp({ email, password, options: { data: { display_name: label } } });
  if (error) throw new Error(`signUp failed: ${error.message}`);
  if (!data.session) throw new Error('No session after sign up: turn off "Confirm email" in the dev project, or pass pre-made users.');
  return data.user!.id;
}

const values = (title: string, over: Partial<ItemFormValues> = {}): ItemFormValues => ({
  kind: "activity", title, startsAt: "2026-12-01T04:30:00.000Z", endsAt: null, tz: "Asia/Kolkata",
  locationUrl: null, visibility: "shared", groupItem: false, notes: "", ...over,
});
const pdf = (name: string) => new File([`%PDF smoke ${name}`], `${name}.pdf`, { type: "application/pdf" });

describe.skipIf(!run)("real Supabase project", () => {
  const alice = newClient();
  const bob = newClient();
  let aliceId = "";
  let bobId = "";
  let tripId = "";
  let sharedItemId = "";
  let privateItemId = "";
  let sharedDocPath = "";
  let personalDocPath = "";

  beforeAll(async () => {
    aliceId = await signInAs(alice, "alice");
    bobId = await signInAs(bob, "bob");
  });

  afterAll(async () => {
    await alice.auth.signOut();
    await bob.auth.signOut();
  });

  it("creates a trip and items as the organizer", async () => {
    const { data, error } = await alice.rpc("create_trip", { p_name: "Smoke Goa", p_start: "2026-12-01", p_end: "2026-12-05" });
    expect(error).toBeNull();
    tripId = data as string;
    const shared = await createItem(alice, tripId, aliceId, values("Museum"));
    const secret = await createItem(alice, tripId, aliceId, values("Secret plan", { visibility: "private" }));
    sharedItemId = shared.id;
    privateItemId = secret.id;
    expect(shared.version).toBe(1);
  });

  it("gives the sign-up name to the profile", async () => {
    const { data } = await alice.from("profiles").select().eq("user_id", aliceId);
    expect((data as { display_name: string }[])[0]?.display_name).toBe("alice");
  });

  it("a person who joined by invite link is pending and sees nothing", async () => {
    const invite = await createInviteApi(alice).createInvite(tripId);
    expect(invite.token).toMatch(/^[0-9a-f]{64}$/);
    expect(await createInviteApi(bob).redeemInvite(invite.token)).toEqual({ tripId, status: "pending" });
    expect(await createTripSource(bob).fetchSnapshot(tripId)).toEqual({ status: "no-access" });
  });

  it("after approval they see shared items and names, but not private ones", async () => {
    await createInviteApi(alice).approveMember(tripId, bobId);
    const result = await createTripSource(bob).fetchSnapshot(tripId);
    if (result.status !== "ok") throw new Error("expected access");
    expect(result.snapshot.trip.name).toBe("Smoke Goa");
    expect(result.snapshot.items.map((i) => i.title)).toEqual(["Museum"]);
    expect(result.snapshot.members.map((m) => m.displayName).sort()).toEqual(["alice", "bob"]);
    expect(result.snapshot.items.map((i) => i.id)).not.toContain(privateItemId);
  });

  it("the owner sees their private item too", async () => {
    const result = await createTripSource(alice).fetchSnapshot(tripId);
    if (result.status !== "ok") throw new Error("expected access");
    expect(result.snapshot.items.map((i) => i.title).sort()).toEqual(["Museum", "Secret plan"]);
  });

  it("RSVPs show up for everyone, and joining twice is harmless", async () => {
    await setRsvp(bob, sharedItemId, bobId, true);
    await setRsvp(bob, sharedItemId, bobId, true);
    const result = await createTripSource(alice).fetchSnapshot(tripId);
    if (result.status !== "ok") throw new Error("expected access");
    expect(result.snapshot.rsvps).toEqual([{ itemId: sharedItemId, userId: bobId }]);
    await setRsvp(bob, sharedItemId, bobId, false);
  });

  describe("changes made offline", () => {
    const writerFor = (client: SupabaseClient): Writer => ({
      createItem: async (t, o, v, id) => void (await createItem(client, t, o, v, id)),
      updateItem: async (i, v) => void (await updateItem(client, i, v)),
      deleteItem: (id) => deleteItem(client, id),
      setRsvp: (i, u, g) => setRsvp(client, i, u, g),
    });
    const bobSide = (name: string) => {
      const db = openOfflineDb(`smoke-${name}-${stamp}`);
      return { db, source: createTripSource(bob), documents: createDocumentSource(bob), viewerId: bobId, writer: writerFor(bob) };
    };
    // Bob edited a minute ago while offline (a minute of margin for any clock difference with the server).
    const aMinuteAgo = () => Date.now() - 60_000;

    it("edits that do not clash go through, a clashing one becomes a draft with a notice, and a new plan and RSVP are sent", async () => {
      const bobs = bobSide("outbox");
      const mine = await createItem(bob, tripId, bobId, values("Bob's plan"));
      await syncTrip(bobs, tripId);
      const local = (await getLocalTrip(bobs.db, tripId))!.snapshot.items.find((i) => i.id === mine.id)!;
      const q = { db: bobs.db, now: aMinuteAgo };

      await queueItemEdit(q, { tripId, item: local, values: values("Bob title", { notes: "bob notes" }) });
      const newPlanId = await queueCreate(q, { tripId, ownerId: bobId, values: values("Bob dinner") });
      await queueRsvp(q, { tripId, itemId: sharedItemId, userId: bobId, going: true });

      // meanwhile the organizer renames the same plan, online
      const aliceView = await createTripSource(alice).fetchSnapshot(tripId);
      if (aliceView.status !== "ok") throw new Error("expected access");
      await updateItem(alice, aliceView.snapshot.items.find((i) => i.id === mine.id)!, values("Alice title"));

      // Bob reconnects
      const result = await flushOutbox(bobs, tripId);
      expect(result).toMatchObject({ sent: 3, drafts: 1, notices: 1, deferred: false });

      const after = await createTripSource(alice).fetchSnapshot(tripId);
      if (after.status !== "ok") throw new Error("expected access");
      const saved = after.snapshot.items.find((i) => i.id === mine.id)!;
      expect(saved.title).toBe("Alice title"); // theirs stays
      expect(saved.details.notes).toBe("bob notes"); // the edit that did not clash went through
      expect(after.snapshot.items.find((i) => i.id === newPlanId)?.title).toBe("Bob dinner"); // saved under the id it was given offline
      expect(after.snapshot.rsvps).toContainEqual({ itemId: sharedItemId, userId: bobId });

      expect(await listOutbox(bobs.db, tripId)).toEqual([]);
      expect((await listDrafts(bobs.db, tripId))[0]).toMatchObject({ kind: "update", field: "title", value: "Bob title" });
      expect((await listNotices(bobs.db, tripId))[0]).toMatchObject({ kind: "lost", field: "title" });
    });

    it("an edit to a plan that was deleted meanwhile is kept as a draft, with a notice", async () => {
      const bobs = bobSide("deleted");
      const doomed = await createItem(bob, tripId, bobId, values("Doomed plan"));
      await syncTrip(bobs, tripId);
      const local = (await getLocalTrip(bobs.db, tripId))!.snapshot.items.find((i) => i.id === doomed.id)!;
      await queueItemEdit({ db: bobs.db, now: aMinuteAgo }, { tripId, item: local, values: values("Renamed") });

      const removed = await alice.from("items").delete().eq("id", doomed.id).select();
      expect(removed.data).toHaveLength(1);

      expect(await flushOutbox(bobs, tripId)).toMatchObject({ sent: 0, drafts: 1, notices: 1 });
      expect((await listNotices(bobs.db, tripId))[0]).toMatchObject({ kind: "deleted", itemTitle: "Doomed plan" });
      expect((await listDrafts(bobs.db, tripId))[0]).toMatchObject({ value: "Renamed" });
    });

    it("a change the server refuses becomes a draft instead of retrying forever", async () => {
      const bobs = bobSide("refused");
      const view = await createTripSource(bob).fetchSnapshot(tripId);
      if (view.status !== "ok") throw new Error("expected access");
      const alices = view.snapshot.items.find((i) => i.title === "Museum")!; // owned by Alice: Bob has no edit rights
      await syncTrip(bobs, tripId);
      await queueItemEdit({ db: bobs.db, now: aMinuteAgo }, { tripId, item: alices, values: values("Bob changes Alice's plan") });
      expect(await flushOutbox(bobs, tripId)).toMatchObject({ sent: 0, drafts: 1, notices: 1, deferred: false });
      expect((await listNotices(bobs.db, tripId))[0]).toMatchObject({ kind: "rejected" });
      expect(await listOutbox(bobs.db, tripId)).toEqual([]);
    });
  });

  it("saving checks the version: a stale copy is a conflict", async () => {
    const snap = await createTripSource(alice).fetchSnapshot(tripId);
    if (snap.status !== "ok") throw new Error("expected access");
    const original = snap.snapshot.items.find((i) => i.id === sharedItemId)!;
    const saved = await updateItem(alice, original, values("Museum (moved)"));
    expect(saved.version).toBe(2);
    expect(saved.title).toBe("Museum (moved)");
    await expect(updateItem(alice, original, values("Stale edit"))).rejects.toBeInstanceOf(ConflictError);
  });

  it("uploads documents; everyone can open the shared one, only the owner the personal one", async () => {
    const shared = await uploadDocument(alice, pdf("tickets"), { tripId, ownerId: aliceId, itemId: sharedItemId, scope: "shared", kind: "ticket" });
    const personal = await uploadDocument(alice, pdf("passport"), { tripId, ownerId: aliceId, itemId: null, scope: "personal", kind: "passport" });
    sharedDocPath = shared.storagePath;
    personalDocPath = personal.storagePath;
    expect(shared.fileName).toBe("tickets.pdf");

    expect(await getDocumentUrl(bob, shared)).toMatch(/^https:\/\//);
    await expect(getDocumentUrl(bob, personal)).rejects.toThrow();
    expect(await getDocumentUrl(alice, personal)).toMatch(/^https:\/\//);

    const bobSees = await createTripSource(bob).fetchSnapshot(tripId);
    if (bobSees.status !== "ok") throw new Error("expected access");
    expect(bobSees.snapshot.documents.map((d) => d.storagePath)).toEqual([sharedDocPath]);
  });

  it("a member cannot upload into someone else's folder", async () => {
    const { error } = await bob.storage.from("trip-documents").upload(`${tripId}/${aliceId}/sneaky.pdf`, new Blob(["x"]), { contentType: "application/pdf" });
    expect(error).not.toBeNull();
  });

  it("the offline copy syncs, keeps the shared document, and never stores another person's personal one", async () => {
    const db = openOfflineDb(`smoke-${stamp}`);
    const deps = { db, source: createTripSource(bob), documents: createDocumentSource(bob), viewerId: bobId };
    expect(await syncTrip(deps, tripId)).toMatchObject({ status: "synced" });
    expect(await cacheDocuments(deps, tripId)).toMatchObject({ cached: 1, failed: [] });
    const local = await getLocalTrip(db, tripId);
    const sharedDoc = local!.snapshot.documents.find((d) => d.storagePath === sharedDocPath)!;
    const blob = await getLocalDocument(db, sharedDoc, await getDeviceKey(db));
    expect(await blob!.text()).toContain("%PDF smoke tickets");
    expect(local!.snapshot.documents.map((d) => d.storagePath)).not.toContain(personalDocPath);
  });

  it("removing a member ends their access and wipes their device copy on the next sync", async () => {
    const db = openOfflineDb(`smoke-removed-${stamp}`);
    const deps = { db, source: createTripSource(bob), documents: createDocumentSource(bob), viewerId: bobId };
    await syncTrip(deps, tripId);
    await createInviteApi(alice).removeMember(tripId, bobId);
    expect(await createTripSource(bob).fetchSnapshot(tripId)).toEqual({ status: "no-access" });
    expect(await syncTrip(deps, tripId)).toEqual({ status: "removed" });
    expect(await getLocalTrip(db, tripId)).toBeNull();
    const doc = { id: "x", tripId, itemId: null, ownerId: aliceId, scope: "shared" as const, storagePath: sharedDocPath, kind: "ticket", fileName: "tickets.pdf" };
    await expect(getDocumentUrl(bob, doc)).rejects.toThrow();
  });

  it("organizer tools through the real app services: create a trip, invite links, approval and edit rights", async () => {
    const aliceApp = createServices(alice);
    const bobApp = createServices(bob);
    const trip2 = await aliceApp.actions.createTrip({ name: "Smoke Hampi", startDate: "2027-01-10", endDate: "2027-01-14" });
    expect(await aliceApp.actions.listTrips()).toContainEqual(expect.objectContaining({ id: trip2, name: "Smoke Hampi", startDate: "2027-01-10", endDate: "2027-01-14" }));

    const invite = await aliceApp.invites.createInvite(trip2);
    expect((await aliceApp.actions.listInvites(trip2)).map((i) => i.id)).toContain(invite.id);
    expect(await bobApp.actions.listInvites(trip2)).toEqual([]); // only the organizer can see invite links

    expect(await bobApp.invites.redeemInvite(invite.token)).toEqual({ tripId: trip2, status: "pending" });
    await aliceApp.invites.approveMember(trip2, bobId);

    // Bob cannot edit Alice's plan until the organizer allows it
    const plan = await createItem(alice, trip2, aliceId, values("Alice's plan"));
    await expect(updateItem(bob, plan, values("Bob's edit"))).rejects.toBeInstanceOf(ConflictError);
    await aliceApp.actions.setEditRights(trip2, bobId, true);
    expect((await updateItem(bob, plan, values("Bob's edit"))).title).toBe("Bob's edit");
    await aliceApp.actions.setEditRights(trip2, bobId, false);
    const again = await createTripSource(bob).fetchSnapshot(trip2);
    if (again.status !== "ok") throw new Error("expected access");
    await expect(updateItem(bob, again.snapshot.items.find((i) => i.id === plan.id)!, values("Bob again"))).rejects.toBeInstanceOf(ConflictError);

    // a member cannot grant rights, and a stopped link disappears
    await expect(bobApp.actions.setEditRights(trip2, aliceId, true)).rejects.toThrow();
    await aliceApp.invites.revokeInvite(invite.id);
    expect(await aliceApp.actions.listInvites(trip2)).toEqual([]);
    await expect(createInviteApi(bob).redeemInvite(invite.token)).rejects.toThrow(/invalid or expired/); // a stopped link no longer works for anyone
  });

  it("account basics through the real app services: name, co-organizer, leaving, deleting a trip and an account", async () => {
    const aliceApp = createServices(alice);
    const bobApp = createServices(bob);
    const trip3 = await aliceApp.actions.createTrip({ name: "Smoke Account Trip", startDate: null, endDate: null });
    const invite = await aliceApp.invites.createInvite(trip3);
    await bobApp.invites.redeemInvite(invite.token);
    await aliceApp.invites.approveMember(trip3, bobId);

    // a new name shows up for the other members
    await bobApp.actions.updateDisplayName("Bobby");
    expect(await bobApp.actions.getProfile()).toEqual({ displayName: "Bobby" });
    const seen = await createTripSource(alice).fetchSnapshot(trip3);
    if (seen.status !== "ok") throw new Error("expected access");
    expect(seen.snapshot.members.find((m) => m.userId === bobId)?.displayName).toBe("Bobby");

    // a co-organizer can invite; a member again cannot
    await aliceApp.actions.setMemberRole(trip3, bobId, "organizer");
    await expect(bobApp.invites.createInvite(trip3)).resolves.toBeDefined();
    await aliceApp.actions.setMemberRole(trip3, bobId, "member");
    await expect(bobApp.invites.createInvite(trip3)).rejects.toThrow();
    // the only organizer cannot step down
    await expect(aliceApp.actions.setMemberRole(trip3, aliceId, "member")).rejects.toThrow(/only organizer/i);

    // Bob adds a private plan, a group plan, a personal document and a shared document, then leaves
    await createItem(bob, trip3, bobId, values("Bob private", { visibility: "private" }));
    const groupPlan = await createItem(bob, trip3, bobId, values("Bob group plan"));
    const personalDoc = await uploadDocument(bob, pdf("bob-passport"), { tripId: trip3, ownerId: bobId, itemId: null, scope: "personal", kind: "passport" });
    const sharedDoc = await uploadDocument(bob, pdf("bob-tickets"), { tripId: trip3, ownerId: bobId, itemId: groupPlan.id, scope: "shared", kind: "ticket" });
    await bobApp.actions.leaveTrip(trip3);
    const afterLeave = await createTripSource(alice).fetchSnapshot(trip3);
    if (afterLeave.status !== "ok") throw new Error("expected access");
    expect(afterLeave.snapshot.members.map((m) => m.userId)).toEqual([aliceId]);
    expect(afterLeave.snapshot.items.map((i) => i.title)).toEqual(["Bob group plan"]); // private plan gone, group plan stays
    expect(afterLeave.snapshot.documents.map((d) => d.storagePath)).toEqual([sharedDoc.storagePath]); // personal document gone
    expect(await createTripSource(bob).fetchSnapshot(trip3)).toEqual({ status: "no-access" });
    expect(personalDoc.storagePath).toContain(bobId);

    // the only organizer cannot delete the account while others are in a trip... (Bob is gone from trip3, so use trip2 below)
    // Alice deletes the trip: every file goes too
    await aliceApp.actions.deleteTrip(trip3);
    expect((await aliceApp.actions.listTrips()).map((t) => t.id)).not.toContain(trip3);

    // an account deletion is refused while the person is the only organizer of a trip with other people in it
    const trip4 = await aliceApp.actions.createTrip({ name: "Smoke Blocker Trip", startDate: null, endDate: null });
    const invite4 = await aliceApp.invites.createInvite(trip4);
    await bobApp.invites.redeemInvite(invite4.token);
    await aliceApp.invites.approveMember(trip4, bobId);
    await expect(aliceApp.actions.deleteAccount()).rejects.toThrow(/only organizer of "Smoke Blocker Trip"/);
    expect((await aliceApp.actions.listTrips()).map((t) => t.id)).toContain(trip4); // nothing was changed

    // Bob (a member) deletes his account: he is gone, the trip carries on, his group plan is handed over
    await createItem(bob, trip4, bobId, values("Bob booking"));
    await bobApp.actions.deleteAccount();
    const afterDelete = await createTripSource(alice).fetchSnapshot(trip4);
    if (afterDelete.status !== "ok") throw new Error("expected access");
    expect(afterDelete.snapshot.members.map((m) => m.userId)).toEqual([aliceId]);
    expect(afterDelete.snapshot.items.find((i) => i.title === "Bob booking")?.ownerId).toBe(aliceId);
    await expect(createInviteApi(bob).redeemInvite(invite4.token)).rejects.toThrow(); // his session no longer works
  });
});

// A weak password is refused by the server itself, before any account exists or any email is sent.
describe.skipIf(!run)("password rules on the real project", () => {
  it("rejects a password shorter than 10 characters", async () => {
    const { data, error } = await newClient().auth.signUp({ email: `smoke-${stamp}-weak@example.invalid`, password: "short-pw1" });
    expect(error?.code).toBe("weak_password");
    expect(data.user).toBeNull();
  });
});
