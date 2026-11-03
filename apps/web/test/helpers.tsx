import type { Item, TripSnapshot } from "@hoppin/core";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { vi } from "vitest";
import { createAppRoutes } from "../src/app/routes";
import { ServicesProvider, type Services } from "../src/app/services";
import type { SessionClient } from "../src/app/session";
import { openOfflineDb } from "../src/offline/db";
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
export function fakeServices(opts: { session?: Session; snapshot?: TripSnapshot | "no-access" | Error; trips?: TripRow[]; invites?: { id: string; token: string; createdAt: string; expiresAt: string }[] } = {}) {
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
      sendMagicLink: vi.fn(async () => {}),
      signIn: vi.fn(async () => {}),
      signOut: vi.fn(async () => {
        session = null;
        listener("SIGNED_OUT", null);
      }),
    },
    invites: {
      createInvite: vi.fn(async () => ({ id: "inv-new", token: "b2".repeat(32) })),
      revokeInvite: vi.fn(async () => {}),
      redeemInvite: vi.fn(async () => ({ tripId: "t1", status: "pending" as const })),
      approveMember: vi.fn(async () => {}),
      removeMember: vi.fn(async () => {}),
    },
    actions: {
      createItem: vi.fn(async () => {}),
      updateItem: vi.fn(async () => {}),
      setRsvp: vi.fn(async () => {}),
      uploadDocument: vi.fn(async () => {}),
      documentUrl: vi.fn(async () => "https://signed.example/doc"),
      listTrips: vi.fn(async () => opts.trips ?? [{ id: "t1", name: "Goa", startDate: "2026-12-01", endDate: "2026-12-05" }]),
      createTrip: vi.fn(async () => "new-trip"),
      listInvites: vi.fn(async () => opts.invites ?? []),
      setEditRights: vi.fn(async () => {}),
      getProfile: vi.fn(async () => ({ displayName: "Aman" })),
      updateDisplayName: vi.fn(async () => {}),
      leaveTrip: vi.fn(async () => {}),
      setMemberRole: vi.fn(async () => {}),
      deleteTrip: vi.fn(async () => {}),
      deleteAccount: vi.fn(async () => {}),
    },
    clock: { now: () => NOW, timeZone: TZ },
  } satisfies Services;
  return { services: services as Services & typeof services, fetchSnapshot };
}

export function renderApp(path: string, services: Services) {
  const router = createMemoryRouter(createAppRoutes(), { initialEntries: [path] });
  const utils = render(
    <ThemeProvider>
      <ServicesProvider services={services}>
        <RouterProvider router={router} />
      </ServicesProvider>
    </ThemeProvider>,
  );
  return { router, ...utils };
}
