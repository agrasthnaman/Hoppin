import type { SnapshotResult, TripSource } from "@hoppin/core";
import {
  assembleSnapshot,
  type DocumentRow,
  type ExpenseLogRow,
  type ExpenseRow,
  type ExpenseShareRow,
  type GuestRow,
  type ItemRow,
  type MemberRow,
  type PollOptionRow,
  type PollRow,
  type PollVoteRow,
  type ProfileRow,
  type RsvpRow,
  type TripRow,
} from "./mappers";

type Failure = { message: string } | null;

/** The slice of the Supabase query builder used for reading, so it can be faked in tests. */
export interface ReadClient {
  from(table: string): {
    select(): {
      eq(column: string, value: string): any;
      in(column: string, values: string[]): any;
    };
  };
}

async function read<T>(query: PromiseLike<{ data: unknown; error: Failure }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

/**
 * Loads one trip as the signed-in person sees it (the database rules decide what they may read).
 * If the trip is not visible they have no access (never joined, or removed). Any failed query throws,
 * so a half-loaded trip is never stored.
 */
export function createTripSource(client: ReadClient): TripSource {
  return {
    async fetchSnapshot(tripId: string): Promise<SnapshotResult> {
      const [trip] = await read<TripRow>(client.from("trips").select().eq("id", tripId));
      if (!trip) return { status: "no-access" };

      const [members, items, documents, polls, pollOptions, pollVotes, guests, expenses, shares, expenseLog] = await Promise.all([
        read<MemberRow>(client.from("members").select().eq("trip_id", tripId)),
        read<ItemRow>(client.from("items").select().eq("trip_id", tripId)),
        read<DocumentRow>(client.from("documents").select().eq("trip_id", tripId)),
        read<PollRow>(client.from("polls").select().eq("trip_id", tripId)),
        read<PollOptionRow>(client.from("poll_options").select().eq("trip_id", tripId)),
        read<PollVoteRow>(client.from("poll_votes").select().eq("trip_id", tripId)),
        read<GuestRow>(client.from("trip_guests").select().eq("trip_id", tripId)),
        read<ExpenseRow>(client.from("expenses").select().eq("trip_id", tripId)),
        read<ExpenseShareRow>(client.from("expense_shares").select().eq("trip_id", tripId)),
        read<ExpenseLogRow>(client.from("change_log").select().eq("trip_id", tripId).not("expense_id", "is", null)),
      ]);
      const [profiles, rsvps] = await Promise.all([
        members.length ? read<ProfileRow>(client.from("profiles").select().in("user_id", members.map((m) => m.user_id))) : [],
        items.length ? read<RsvpRow>(client.from("rsvps").select().in("item_id", items.map((i) => i.id))) : [],
      ]);
      return {
        status: "ok",
        snapshot: assembleSnapshot({ trip, members, profiles, items, rsvps, documents, polls, pollOptions, pollVotes, guests, expenses, shares, expenseLog }),
      };
    },
  };
}
