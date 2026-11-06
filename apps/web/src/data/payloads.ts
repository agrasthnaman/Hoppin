import { isValidPlace, roundPlace, type ExpenseRecord, type Item, type Place } from "@hoppin/core";
import type { ItemFormValues } from "../components/ItemForm";

function details(base: Record<string, unknown>, notes: string, pollId?: string, place?: Place | null): Record<string, unknown> {
  const { notes: _old, place: previous, ...rest } = base;
  const next: Record<string, unknown> = notes ? { ...rest, notes } : { ...rest };
  if (pollId) next.pollId = pollId;
  const kept = place === undefined ? (isValidPlace(previous) ? roundPlace(previous) : null) : place && isValidPlace(place) ? roundPlace(place) : null;
  if (kept) next.place = kept;
  return next;
}

/** Row for a new item. The owner is always the signed-in person (the database enforces it too). An id can be chosen up front (plans made offline). */
export function itemInsertRow(tripId: string, ownerId: string, values: ItemFormValues, id?: string) {
  return {
    ...(id ? { id } : {}),
    trip_id: tripId,
    owner_id: ownerId,
    kind: values.kind,
    visibility: values.visibility,
    group_item: values.groupItem,
    starts_at: values.startsAt,
    ends_at: values.endsAt,
    tz: values.tz,
    end_tz: values.endTz ?? null,
    title: values.title,
    location_url: values.locationUrl,
    details: details({}, values.notes, values.pollId, values.place),
  };
}

/** Changes for an existing item. Never includes trip or owner (they cannot change); other details are kept. */
export function itemUpdatePatch(item: Item, values: ItemFormValues) {
  const { trip_id: _t, owner_id: _o, ...rest } = itemInsertRow(item.tripId, item.ownerId, values);
  return { ...rest, details: details(item.details, values.notes, values.pollId, values.place) };
}

/** What save_expense() takes. `guestIds` tells guests apart from members (both are ids in the app). */
export function expensePayload(expense: ExpenseRecord, guestIds: ReadonlySet<string>) {
  if (expense.rate === null || expense.rateDate === null) throw new Error("An expense needs its exchange rate before it is sent");
  const isGuest = (who: string) => guestIds.has(who);
  return {
    id: expense.id,
    trip_id: expense.tripId,
    kind: expense.kind,
    title: expense.title,
    category: expense.category,
    paid_by_user: isGuest(expense.paidBy) ? null : expense.paidBy,
    paid_by_guest: isGuest(expense.paidBy) ? expense.paidBy : null,
    amount: expense.amount,
    currency: expense.currency,
    rate: expense.rate,
    rate_date: expense.rateDate,
    base_currency: expense.baseCurrency,
    spent_on: expense.spentOn,
    shares: expense.split.map((s) => ({
      ...(isGuest(s.who) ? { guest_id: s.who } : { user_id: s.who }),
      ...(s.share === undefined ? {} : { share: s.share }),
    })),
  };
}
