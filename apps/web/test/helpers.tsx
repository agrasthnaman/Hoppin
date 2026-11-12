import type { ExpenseRecord, Item, MembershipStatus, TripDestination, TripGuest, TripNotification, TripSnapshot } from "@hoppin/core";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { vi } from "vitest";
import { createAppRoutes } from "../src/app/routes";
import { ServicesProvider, type Services } from "../src/app/services";
import type { SessionClient } from "../src/app/session";
import { openOfflineDb } from "../src/offline/db";
import type { WeatherResult } from "../src/providers/weather";
import { MotionRoot } from "../src/lib/motion";
import { ThemeProvider } from "../src/theme/ThemeProvider";

export const NOW = Date.UTC(2026, 11, 2, 4, 0, 0); // 2 Dec 2026, 09:30 in Kolkata
export const TZ = "Asia/Kolkata";

export const item = (over: Partial<Item> & Pick<Item, "id" | "title" | "startsAt">): Item => ({
  tripId: "t1",
  ownerId: "me",
  kind: "activity",
  visibility: "shared",
  groupItem: true,
  endsAt: null,
  tz: TZ,
  locationUrl: null,
  details: {},
  version: 1,
  ...over,
});
const at = (hhmm: string, day = "02") => new Date(`2026-12-${day}T${hhmm}:00+05:30`).toISOString();

export function snapshot(over: Partial<TripSnapshot> = {}): TripSnapshot {
  return {
    trip: { id: "t1", name: "Goa", startDate: "2026-12-01", endDate: "2026-12-05" },
    members: [
      { userId: "org", role: "organizer", status: "approved", canEditAll: false, displayName: "Neha" },
      { userId: "me", role: "member", status: "approved", canEditAll: false, displayName: "Aman" },
      { userId: "riya", role: "member", status: "approved", canEditAll: false, displayName: "Riya" },
    ],
    items: [
      item({ id: "i1", title: "Old town tour", startsAt: at("10:00"), endsAt: at("12:00") }),
      item({ id: "i2", title: "Museum", startsAt: at("10:30"), groupItem: false, ownerId: "riya" }),
      item({ id: "i3", title: "Visit ABC place", startsAt: at("15:00"), groupItem: false, visibility: "private" }),
      item({ id: "i4", title: "Lunch on day three", startsAt: at("13:00", "03"), endsAt: at("14:00", "03"), ownerId: "riya" }),
    ],
    rsvps: [],
    documents: [
      { id: "d1", tripId: "t1", itemId: "i1", ownerId: "me", scope: "shared", storagePath: "t1/me/d1-ticket.pdf", kind: "ticket", fileName: "d1-ticket.pdf" },
    ],
    ...over,
  };
}

type Session = { user: { id: string; email?: string } } | null;
let n = 0;

type TripRow = { id: string; name: string; startDate?: string | null; endDate?: string | null };
export function fakeServices(opts: { session?: Session; snapshot?: TripSnapshot | "no-access" | Error; trips?: TripRow[]; invites?: { id: string; token: string; createdAt: string; expiresAt: string }[]; updates?: TripNotification[] } = {}) {
  let session: Session = opts.session === undefined ? { user: { id: "me", email: "aman@example.com" } } : opts.session;
  let listener: (e: string, s: Session) => void = () => {};
  const sessionClient: SessionClient = {
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: (cb) => {
        listener = cb;
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
  };
  const result = opts.snapshot ?? snapshot();
  const fetchSnapshot = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result === "no-access" ? ({ status: "no-access" } as const) : ({ status: "ok", snapshot: result } as const);
  });
  const services = {
    db: openOfflineDb(`screens-${(n += 1)}`),
    tripSource: { fetchSnapshot },
    documentSource: { download: vi.fn(async () => ({ data: new TextEncoder().encode("file").buffer as ArrayBuffer, contentType: "application/pdf" })) },
    sessionClient,
    auth: {
      signUp: vi.fn(async () => ({ confirmationNeeded: true })),
      signIn: vi.fn(async () => {}),
      resendConfirmation: vi.fn(async () => {}),
      requestPasswordReset: vi.fn(async () => {}),
      queueStatus: vi.fn(async (): Promise<"none" | "waiting" | "invited" | "registered"> => "none"),
      joinQueue: vi.fn(async (): Promise<"queued" | "already_queued" | "registered" | "full"> => "queued"),
      updatePassword: vi.fn(async () => {}),
      requestCode: vi.fn(async () => {}),
      verifyEmailLink: vi.fn(async () => {}),
      signOut: vi.fn(async () => {
        session = null;
        listener("SIGNED_OUT", null);
      }),
    },
    invites: {
      createInvite: vi.fn(async () => ({ id: "inv-new", token: "b2".repeat(32) })),
      revokeInvite: vi.fn(async () => {}),
      redeemInvite: vi.fn(async (): Promise<{ tripId: string; status: MembershipStatus }> => ({ tripId: "t1", status: "pending" })),
      approveMember: vi.fn(async () => {}),
      removeMember: vi.fn(async () => {}),
    },
    actions: {
      createItem: vi.fn(async () => {}),
      updateItem: vi.fn(async () => {}),
      deleteItem: vi.fn(async () => {}),
      setRsvp: vi.fn(async () => {}),
      createPoll: vi.fn(async () => "new-poll"),
      castVote: vi.fn(async () => {}),
      closePoll: vi.fn(async () => {}),
      deletePoll: vi.fn(async () => {}),
      uploadDocument: vi.fn(async () => {}),
      deleteDocument: vi.fn(async () => {}),
      documentUrl: vi.fn(async () => "https://signed.example/doc"),
      listTrips: vi.fn(async () => opts.trips ?? [{ id: "t1", name: "Goa", startDate: "2026-12-01", endDate: "2026-12-05" }]),
      createTrip: vi.fn(async () => "new-trip"),
      setTripDestination: vi.fn(async () => {}),
      listInvites: vi.fn(async () => opts.invites ?? []),
      setEditRights: vi.fn(async () => {}),
      getProfile: vi.fn(async () => ({ displayName: "Aman" })),
      updateDisplayName: vi.fn(async () => {}),
      leaveTrip: vi.fn(async () => {}),
      setMemberRole: vi.fn(async () => {}),
      deleteTrip: vi.fn(async () => {}),
      deleteAccount: vi.fn(async () => {}),
      saveExpense: vi.fn(async (_expense: ExpenseRecord, _guestIds: ReadonlySet<string>) => {}),
      deleteExpense: vi.fn(async (_expenseId: string) => {}),
      addGuest: vi.fn(async (_guest: TripGuest) => {}),
      listUpdates: vi.fn(async (_tripId: string) => ({ notifications: opts.updates ?? [], emailOn: true, pushOn: false })),
      unreadUpdates: vi.fn(async (_tripId: string) => (opts.updates ?? []).filter((u) => !u.readAt).length),
      markUpdatesRead: vi.fn(async (_tripId: string) => {}),
      setEmailUpdates: vi.fn(async (_tripId: string, _on: boolean) => {}),
      setPushUpdates: vi.fn(async (_tripId: string, _on: boolean) => {}),
      savePushToken: vi.fn(async (_token: string, _platform: "ios" | "android") => {}),
      forgetPushToken: vi.fn(async (_token: string) => {}),
    },
    clock: { now: () => NOW, timeZone: TZ },
    weather: { forDay: vi.fn(async (_place: { lat: number; lon: number }, _date: string): Promise<WeatherResult> => ({ status: "unavailable" })) },
    geocoder: { find: vi.fn(async (_query: string): Promise<TripDestination | null> => null) },
    places: { searchPlaces: vi.fn(async () => ({ status: "ok" as const, results: [] })), reversePlace: vi.fn(async () => null) },
    rates: {
      source: "European Central Bank",
      quote: vi.fn(async (from: string, to: string, date?: string) => ({ from, to, date: date ?? "2026-12-02", rate: from === to ? 1 : 2, fetchedAt: NOW, old: false })),
    },
  } satisfies Services;
  return { services: services as Services & typeof services, fetchSnapshot };
}

export function renderApp(path: string, services: Services) {
  const router = createMemoryRouter(createAppRoutes(), { initialEntries: [path] });
  const utils = render(
    <ThemeProvider>
      <MotionRoot>
        <ServicesProvider services={services}>
          <RouterProvider router={router} />
        </ServicesProvider>
      </MotionRoot>
    </ThemeProvider>,
  );
  return { router, ...utils };
}
