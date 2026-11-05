import type { ExpenseRecord, Item, TripGuest } from "@hoppin/core";
import type { ItemFormValues } from "../components/ItemForm";
import { itemFromRow, type ItemRow } from "./mappers";
import { expensePayload, itemInsertRow, itemUpdatePatch } from "./payloads";

/** The Supabase client, as far as writing goes (kept loose so it can be faked). */
export interface WriteClient {
  from(table: string): any;
}

/** Writing money also calls database functions, so a bill and its split always change together. */
export interface MoneyClient extends WriteClient {
  rpc(fn: string, args: Record<string, unknown>): any;
}

/** Someone else changed the item after this person loaded it. */
export class ConflictError extends Error {
  constructor() {
    super("Someone else changed this just now. Reload to see their changes, then try again.");
    this.name = "ConflictError";
  }
}

export async function createItem(client: WriteClient, tripId: string, ownerId: string, values: ItemFormValues, id?: string): Promise<Item> {
  const { data, error } = await client.from("items").insert(itemInsertRow(tripId, ownerId, values, id)).select().single();
  if (error) throw new Error(error.message);
  return itemFromRow(data as ItemRow);
}

/** Saves changes only if the item is still at the version the person loaded; otherwise throws `ConflictError`. */
export async function updateItem(client: WriteClient, item: Item, values: ItemFormValues): Promise<Item> {
  const { data, error } = await client
    .from("items")
    .update(itemUpdatePatch(item, values))
    .eq("id", item.id)
    .eq("version", item.version)
    .select();
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ItemRow[];
  if (rows.length === 0) throw new ConflictError();
  return itemFromRow(rows[0] as ItemRow);
}

/** Removes a plan the person may delete. An empty result means the database refused it, or it is already gone. */
export async function deleteItem(client: WriteClient, itemId: string): Promise<void> {
  const { data, error } = await client.from("items").delete().eq("id", itemId).select();
  if (error) throw new Error(error.message);
  if (!data || (data as unknown[]).length === 0) throw new Error("Could not remove the plan");
}

export async function setRsvp(client: WriteClient, itemId: string, userId: string, going: boolean): Promise<void> {
  if (going) {
    const { error } = await client.from("rsvps").insert({ item_id: itemId, user_id: userId });
    if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message); // already in is fine
    return;
  }
  const { error } = await client.from("rsvps").delete().eq("item_id", itemId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** Adds or changes an expense (only the person who added it may change it; the database checks). */
export async function saveExpense(client: MoneyClient, expense: ExpenseRecord, guestIds: ReadonlySet<string>): Promise<void> {
  const { error } = await client.rpc("save_expense", { p: expensePayload(expense, guestIds) });
  if (error) throw new Error(error.message);
}

export async function deleteExpense(client: MoneyClient, expenseId: string): Promise<void> {
  const { error } = await client.rpc("delete_expense", { p_id: expenseId });
  if (error) throw new Error(error.message);
}

/** Adds a guest with the id chosen on the phone. Sending the same guest again is fine. */
export async function addGuest(client: WriteClient, guest: TripGuest): Promise<void> {
  const { error } = await client.from("trip_guests").insert({ id: guest.id, trip_id: guest.tripId, name: guest.name, added_by: guest.addedBy });
  if (!error) return;
  if (/duplicate key/i.test(error.message) && /pkey/i.test(error.message)) return; // an earlier attempt already saved it
  if (/duplicate key/i.test(error.message)) throw new Error(`There's already someone called ${guest.name} in this trip.`);
  throw new Error(error.message);
}

/** The Supabase client, as far as calling database functions goes. */
export interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/** Asks the group a question. The poll and its options are saved together. Returns the poll's id. */
export async function createPoll(client: RpcClient, tripId: string, question: string, multiple: boolean, options: string[]): Promise<string> {
  const { data, error } = await client.rpc("create_poll", { p_trip: tripId, p_question: question, p_multiple: multiple, p_options: options });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Sets this person's choice on a poll, replacing the earlier one. An empty list withdraws it. */
export async function castVote(client: RpcClient, pollId: string, optionIds: string[]): Promise<void> {
  const { error } = await client.rpc("cast_vote", { p_poll: pollId, p_options: optionIds });
  if (error) throw new Error(error.message);
}

export async function closePoll(client: RpcClient, pollId: string): Promise<void> {
  const { error } = await client.rpc("close_poll", { p_poll: pollId });
  if (error) throw new Error(error.message);
}

export async function deletePoll(client: WriteClient, pollId: string): Promise<void> {
  const { data, error } = await client.from("polls").delete().eq("id", pollId).select();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Could not delete the poll");
}
