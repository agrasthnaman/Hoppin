import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ItemFormValues } from "../src/components/ItemForm";
import { createDocumentSource } from "../src/data/document-source";
import { createTripSource } from "../src/data/trip-source";
import { ConflictError, createItem, setRsvp, updateItem } from "../src/data/writes";
import { getDocumentUrl, uploadDocument } from "../src/lib/documents";
import { createInviteApi } from "../src/lib/invite-api";
import { getDeviceKey } from "../src/offline/crypto";
import { openOfflineDb } from "../src/offline/db";
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
});
