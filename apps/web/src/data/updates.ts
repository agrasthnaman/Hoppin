import type { NotifiedChange, TripNotification } from "@hoppin/core";
import type { MoneyClient } from "./writes";

/** The newest digests shown on the Updates screen; older ones are rarely useful during a trip. */
export const UPDATES_SHOWN = 50;

type NotificationRow = { id: string; created_at: string; read_at: string | null; changes: NotifiedChange[] };

function memberFlags(data: unknown): { emailOn: boolean; pushOn: boolean } {
  if (typeof data !== "object" || data === null) return { emailOn: false, pushOn: false };
  const emailOn = "email_digest" in data && typeof data.email_digest === "boolean" ? data.email_digest : false;
  const pushOn = "push_on" in data && typeof data.push_on === "boolean" ? data.push_on : false;
  return { emailOn, pushOn };
}

/** The signed-in person's digests for a trip, newest first, and whether they get them by email or on the phone. */
export async function listUpdates(client: MoneyClient, tripId: string, userId: string): Promise<{ notifications: TripNotification[]; emailOn: boolean; pushOn: boolean }> {
  const [list, member] = await Promise.all([
    client.from("notifications").select("id, created_at, read_at, changes").eq("trip_id", tripId).order("created_at", { ascending: false }).limit(UPDATES_SHOWN),
    client.from("members").select("email_digest, push_on").eq("trip_id", tripId).eq("user_id", userId).maybeSingle(),
  ]);
  if (list.error) throw new Error(list.error.message);
  if (member.error) throw new Error(member.error.message);
  const flags = memberFlags(member.data);
  return {
    notifications: ((list.data ?? []) as NotificationRow[]).map((r) => ({ id: r.id, createdAt: r.created_at, readAt: r.read_at, changes: r.changes ?? [] })),
    emailOn: flags.emailOn,
    pushOn: flags.pushOn,
  };
}

/** How many digests the person has not opened yet (a count only: no rows are sent). */
export async function unreadUpdates(client: MoneyClient, tripId: string): Promise<number> {
  const { count, error } = await client.from("notifications").select("id", { count: "exact", head: true }).eq("trip_id", tripId).is("read_at", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function markUpdatesRead(client: MoneyClient, tripId: string): Promise<void> {
  const { error } = await client.rpc("mark_notifications_read", { p_trip: tripId });
  if (error) throw new Error(error.message);
}

export async function setEmailUpdates(client: MoneyClient, tripId: string, on: boolean): Promise<void> {
  const { error } = await client.rpc("set_email_digest", { p_trip: tripId, p_on: on });
  if (error) throw new Error(error.message);
}

export async function setPushUpdates(client: MoneyClient, tripId: string, on: boolean): Promise<void> {
  const { error } = await client.rpc("set_push_updates", { p_trip: tripId, p_on: on });
  if (error) throw new Error(error.message);
}
