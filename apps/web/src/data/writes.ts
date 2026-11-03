import type { Item } from "@hoppin/core";
import type { ItemFormValues } from "../components/ItemForm";
import { itemFromRow, type ItemRow } from "./mappers";
import { itemInsertRow, itemUpdatePatch } from "./payloads";

/** The Supabase client, as far as writing goes (kept loose so it can be faked). */
export interface WriteClient {
  from(table: string): any;
}

/** Someone else changed the item after this person loaded it. */
export class ConflictError extends Error {
  constructor() {
    super("Someone else changed this just now. Reload to see their changes, then try again.");
    this.name = "ConflictError";
  }
}

export async function createItem(client: WriteClient, tripId: string, ownerId: string, values: ItemFormValues): Promise<Item> {
  const { data, error } = await client.from("items").insert(itemInsertRow(tripId, ownerId, values)).select().single();
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

export async function setRsvp(client: WriteClient, itemId: string, userId: string, going: boolean): Promise<void> {
  if (going) {
    const { error } = await client.from("rsvps").insert({ item_id: itemId, user_id: userId });
    if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message); // already in is fine
    return;
  }
  const { error } = await client.from("rsvps").delete().eq("item_id", itemId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}
