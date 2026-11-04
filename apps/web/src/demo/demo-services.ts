import {
  addDays,
  applyValues,
  applyVote,
  canManagePoll,
  validatePollDraft,
  itemFromValues,
  localDate,
  zonedTimeToInstant,
  type Item,
  type ItemValues,
  type MemberInfo,
  type Poll,
  type RateProvider,
  type SnapshotResult,
  type TripDestination,
  type TripDocument,
  type Vote,
} from "@hoppin/core";
import type { Services } from "../app/services";
import { ConflictError } from "../data/writes";
import { openOfflineDb } from "../offline/db";
import { createRateService, createRateStore, RatesUnavailableError } from "../providers/rates";
import { createWeatherService, createWeatherStore, type Geocoder, type WeatherProvider } from "../providers/weather";

/** A pretend server living in memory, so the whole app can be tried with no accounts, no email and no network. */
export interface DemoOptions {
  /** Which day counts as today (default: the real today). The sample trip is built around it. */
  today?: string;
  timeZone?: string;
  /** Name of the on-device database (default: a fresh one each time, so every reload starts clean). */
  dbName?: string;
}

interface Invite {
  id: string;
  token: string;
  createdAt: string;
  expiresAt: string;
  revoked: boolean;
}
interface DemoTrip {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  destination?: TripDestination | null;
  members: MemberInfo[];
  items: Item[];
  rsvps: { itemId: string; userId: string }[];
  documents: TripDocument[];
  invites: Invite[];
  polls: Poll[];
  votes: Vote[];
}

const ME = "demo-me";
const hex = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");

export function createDemoServices(options: DemoOptions = {}): Services {
  const timeZone = options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = options.today ?? localDate(Date.now(), timeZone);
  // The sample trip started yesterday, so "today" is its busiest day.
  const base = addDays(today, -1);
  const at = (day: number, hhmm: string) => zonedTimeToInstant(`${addDays(base, day)}T${hhmm}`, timeZone);
  const stamp = () => new Date().toISOString();
  let counter = 0;
  const files = new Map<string, { bytes: ArrayBuffer; type: string }>();

  const item = (id: string, tripId: string, ownerId: string, over: Partial<Item> & Pick<Item, "title" | "startsAt">): Item => ({
    id, tripId, ownerId, kind: "activity", visibility: "shared", groupItem: true, endsAt: null, tz: timeZone,
    locationUrl: null, details: {}, version: 1, updatedAt: stamp(), ...over,
  });
  const member = (userId: string, displayName: string, over: Partial<MemberInfo> = {}): MemberInfo => ({
    userId, displayName, role: "member", status: "approved", canEditAll: false, ...over,
  });

  const goa: DemoTrip = {
    id: "demo-goa",
    name: "Goa",
    startDate: base,
    endDate: addDays(base, 4),
    destination: { name: "Goa, India", lat: 15.49, lon: 73.83 },
    members: [member(ME, "Aman", { role: "organizer" }), member("demo-riya", "Riya"), member("demo-neha", "Neha", { canEditAll: true }), member("demo-kabir", "Kabir", { status: "pending" })],
    items: [
      item("g-flight", "demo-goa", ME, { kind: "flight", title: "Delhi to Goa (IndiGo 6E 123)", startsAt: at(0, "06:30"), endsAt: at(0, "09:00"), locationUrl: "https://maps.google.com/?q=Goa+Airport", details: { notes: "Gate B12. Bags close 45 minutes before." } }),
      item("g-stay", "demo-goa", ME, { kind: "stay", title: "Beach Hotel", startsAt: at(0, "14:00"), endsAt: at(4, "11:00"), locationUrl: "https://maps.google.com/?q=Calangute+Beach", details: { notes: "Booking ref BH-48213. Breakfast included." } }),
      item("g-breakfast", "demo-goa", ME, { title: "Breakfast at the hotel", startsAt: at(1, "08:30"), endsAt: at(1, "09:30") }),
      item("g-tour", "demo-goa", ME, { title: "Old town walking tour", startsAt: at(1, "10:00"), endsAt: at(1, "12:30"), locationUrl: "https://maps.google.com/?q=Panjim+Old+Town" }),
      item("g-museum", "demo-goa", "demo-riya", { title: "Museum", groupItem: false, startsAt: at(1, "10:30"), locationUrl: "https://maps.google.com/?q=Goa+State+Museum" }),
      item("g-cafe", "demo-goa", "demo-neha", { title: "Cafe crawl", groupItem: false, startsAt: at(1, "11:30") }),
      item("g-lunch", "demo-goa", ME, { title: "Lunch (booked for 8)", startsAt: at(1, "13:00"), endsAt: at(1, "14:30") }),
      item("g-abc", "demo-goa", ME, { title: "Visit the ABC viewpoint", groupItem: false, visibility: "private", startsAt: at(1, "16:00") }),
      item("g-spice", "demo-goa", ME, { title: "Spice farm day trip", startsAt: at(2, "09:30"), endsAt: at(2, "16:00") }),
      item("g-kayak", "demo-goa", "demo-riya", { title: "Sunset kayaking", groupItem: false, startsAt: at(2, "17:30") }),
      item("g-fort", "demo-goa", ME, { title: "Fort Aguada", startsAt: at(3, "10:00"), endsAt: at(3, "12:00") }),
      item("g-market", "demo-goa", "demo-neha", { title: "Flea market", groupItem: false, startsAt: at(3, "16:00") }),
    ],
    rsvps: [{ itemId: "g-museum", userId: "demo-neha" }],
    documents: [{ id: "d-pass", tripId: "demo-goa", itemId: "g-flight", ownerId: ME, scope: "shared", storagePath: "demo-goa/demo-me/d-pass-boarding-passes.pdf", kind: "ticket", fileName: "boarding-passes.pdf" }],
    invites: [],
    polls: [
      {
        id: "demo-poll-beach", tripId: "demo-goa", createdBy: "demo-riya", question: "Which beach for Thursday?", multiple: false, closed: false, createdAt: stamp(),
        options: [{ id: "demo-beach-baga", label: "Baga" }, { id: "demo-beach-palolem", label: "Palolem" }, { id: "demo-beach-anjuna", label: "Anjuna" }],
      },
    ],
    votes: [
      { pollId: "demo-poll-beach", optionId: "demo-beach-palolem", userId: "demo-riya" },
      { pollId: "demo-poll-beach", optionId: "demo-beach-palolem", userId: "demo-neha" },
    ],
  };
  files.set("d-pass", { bytes: new TextEncoder().encode("Sample boarding passes (demo file)").buffer as ArrayBuffer, type: "text/plain" });

  const manali: DemoTrip = {
    id: "demo-manali",
    name: "Manali weekend",
    startDate: addDays(base, 30),
    endDate: addDays(base, 32),
    members: [member("demo-neha", "Neha", { role: "organizer" }), member(ME, "Aman"), member("demo-riya", "Riya")],
    items: [
      item("m-bus", "demo-manali", "demo-neha", { kind: "transport", title: "Overnight bus from Delhi", startsAt: at(29, "21:00"), endsAt: at(30, "07:00") }),
      item("m-stay", "demo-manali", "demo-neha", { kind: "stay", title: "Riverside cottage", startsAt: at(30, "10:00"), endsAt: at(32, "11:00") }),
      item("m-trek", "demo-manali", "demo-riya", { title: "Short trek to the waterfall", groupItem: false, startsAt: at(31, "08:00") }),
    ],
    rsvps: [],
    documents: [],
    invites: [],
    polls: [],
    votes: [],
  };
  const trips: DemoTrip[] = [goa, manali];
  const find = (tripId: string) => trips.find((t) => t.id === tripId);
  const meIn = (t: DemoTrip) => t.members.find((m) => m.userId === ME);
  let myName = "Aman";
  const soleOrganizer = (t: DemoTrip) =>
    meIn(t)?.role === "organizer" && !t.members.some((m) => m.role === "organizer" && m.status === "approved" && m.userId !== ME);

  // ---- session (always signed in until "Sign out"; signing in needs no email)
  type Listener = (event: string, session: { user: { id: string; email: string } } | null) => void;
  const listeners = new Set<Listener>();
  let signedIn = true;
  const session = () => (signedIn ? { user: { id: ME, email: "aman@demo.test" } } : null);
  const setSignedIn = (v: boolean) => {
    signedIn = v;
    listeners.forEach((l) => l(v ? "SIGNED_IN" : "SIGNED_OUT", session()));
  };

  const writer = {
    async createItem(tripId: string, ownerId: string, values: ItemValues, id?: string) {
      const t = find(tripId);
      if (!t) throw new Error("trip not found");
      const newId = id ?? `demo-item-${(counter += 1)}`;
      if (t.items.some((i) => i.id === newId)) throw new Error('duplicate key value violates unique constraint "items_pkey"');
      t.items.push({ ...itemFromValues(newId, tripId, ownerId, values), version: 1, updatedAt: stamp() });
    },
    async updateItem(current: Item, values: ItemValues) {
      const stored = find(current.tripId)?.items.find((i) => i.id === current.id);
      if (!stored || stored.version !== current.version) throw new ConflictError();
      Object.assign(stored, applyValues(stored, values), { version: stored.version + 1, updatedAt: stamp() });
    },
    async setRsvp(itemId: string, userId: string, going: boolean) {
      const t = trips.find((x) => x.items.some((i) => i.id === itemId));
      if (!t) return;
      t.rsvps = t.rsvps.filter((r) => !(r.itemId === itemId && r.userId === userId));
      if (going) t.rsvps.push({ itemId, userId });
    },
  };

  const guardOrganizer = (tripId: string) => {
    const t = find(tripId);
    if (!t || meIn(t)?.role !== "organizer") throw new Error("only the organizer can do this");
    return t;
  };

  return {
    db: openOfflineDb(options.dbName ?? `hoppin-demo-${Date.now()}`),
    tripSource: {
      async fetchSnapshot(tripId): Promise<SnapshotResult> {
        const t = find(tripId);
        if (!t || meIn(t)?.status !== "approved") return { status: "no-access" };
        return structuredClone({
          status: "ok",
          snapshot: {
            trip: { id: t.id, name: t.name, startDate: t.startDate, endDate: t.endDate, destination: t.destination ?? null },
            members: t.members,
            items: t.items.filter((i) => i.visibility === "shared" || i.ownerId === ME),
            rsvps: t.rsvps,
            documents: t.documents,
            polls: t.polls,
            votes: t.votes.filter((v) => t.members.some((m) => m.userId === v.userId && m.status === "approved")),
          },
        }) as SnapshotResult;
      },
    },
    documentSource: {
      async download(doc) {
        const f = files.get(doc.id);
        if (!f) throw new Error("file not found");
        return { data: f.bytes.slice(0), contentType: f.type };
      },
    },
    sessionClient: {
      auth: {
        getSession: async () => ({ data: { session: session() } }),
        onAuthStateChange: (cb) => {
          listeners.add(cb);
          return { data: { subscription: { unsubscribe: () => void listeners.delete(cb) } } };
        },
      },
    },
    auth: {
      signUp: async () => {
        setSignedIn(true);
        return { confirmationNeeded: false };
      },
      signIn: async () => setSignedIn(true),
      resendConfirmation: async () => {},
      requestPasswordReset: async () => {},
      updatePassword: async () => {},
      verifyEmailLink: async () => setSignedIn(true),
      signOut: async () => setSignedIn(false),
    },
    invites: {
      async createInvite(tripId) {
        const t = guardOrganizer(tripId);
        const now = Date.now();
        const invite = { id: `demo-inv-${(counter += 1)}`, token: hex(), createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 14 * 86_400_000).toISOString(), revoked: false };
        t.invites.push(invite);
        return { id: invite.id, token: invite.token };
      },
      async revokeInvite(inviteId) {
        const invite = trips.flatMap((t) => t.invites).find((i) => i.id === inviteId);
        if (invite) invite.revoked = true;
      },
      async redeemInvite() {
        return { tripId: goa.id, status: "approved" as const };
      },
      async approveMember(tripId, userId) {
        const target = guardOrganizer(tripId).members.find((m) => m.userId === userId && m.status !== "approved");
        if (!target) throw new Error("member not found");
        target.status = "approved";
      },
      async removeMember(tripId, userId) {
        const target = guardOrganizer(tripId).members.find((m) => m.userId === userId);
        if (!target || target.role === "organizer") throw new Error("cannot remove");
        target.status = "removed";
      },
    },
    actions: {
      createItem: writer.createItem,
      updateItem: writer.updateItem,
      setRsvp: writer.setRsvp,
      async createPoll(tripId, question, multiple, options) {
        const t = find(tripId);
        if (!t || meIn(t)?.status !== "approved") throw new Error("only members of this trip can ask a question");
        const problem = validatePollDraft(question, options);
        if (problem) throw new Error(problem);
        const id = `demo-poll-${(counter += 1)}`;
        const labels = options.map((o) => o.trim()).filter(Boolean);
        t.polls.push({
          id, tripId, createdBy: ME, question: question.trim(), multiple, closed: false, createdAt: stamp(),
          options: labels.map((label, i) => ({ id: `${id}-o${i}`, label })),
        });
        return id;
      },
      async castVote(pollId, optionIds) {
        const t = trips.find((x) => x.polls.some((p) => p.id === pollId));
        const poll = t?.polls.find((p) => p.id === pollId);
        if (!t || !poll) throw new Error("poll not found");
        t.votes = applyVote(t.votes, poll, ME, optionIds);
      },
      async closePoll(pollId) {
        const t = trips.find((x) => x.polls.some((p) => p.id === pollId));
        const poll = t?.polls.find((p) => p.id === pollId);
        const me = t && meIn(t);
        if (!t || !poll || !me || !canManagePoll(poll, ME, me.role)) throw new Error("only the person who asked or an organizer can close this poll");
        poll.closed = true;
      },
      async deletePoll(pollId) {
        const t = trips.find((x) => x.polls.some((p) => p.id === pollId));
        const poll = t?.polls.find((p) => p.id === pollId);
        const me = t && meIn(t);
        if (!t || !poll || !me || !canManagePoll(poll, ME, me.role)) throw new Error("Could not delete the poll");
        t.polls = t.polls.filter((p) => p.id !== pollId);
        t.votes = t.votes.filter((v) => v.pollId !== pollId);
      },
      async uploadDocument(file, meta) {
        const t = find(meta.tripId);
        if (!t) throw new Error("trip not found");
        const id = `demo-doc-${(counter += 1)}`;
        files.set(id, { bytes: await file.arrayBuffer(), type: file.type || "application/octet-stream" });
        t.documents.push({ id, tripId: meta.tripId, itemId: meta.itemId, ownerId: meta.ownerId, scope: meta.scope, storagePath: `${meta.tripId}/${meta.ownerId}/${id}-${file.name}`, kind: meta.kind, fileName: file.name });
      },
      async documentUrl(doc) {
        const f = files.get(doc.id);
        if (!f) throw new Error("file not found");
        return URL.createObjectURL(new Blob([f.bytes], { type: f.type }));
      },
      async listTrips() {
        return trips.filter((t) => meIn(t)?.status === "approved").map((t) => ({ id: t.id, name: t.name, startDate: t.startDate, endDate: t.endDate }));
      },
      async createTrip({ name, startDate, endDate, destination }) {
        const id = `demo-${(counter += 1)}`;
        trips.unshift({ id, name, startDate, endDate, destination: destination ?? null, members: [member(ME, "Aman", { role: "organizer" })], items: [], rsvps: [], documents: [], invites: [], polls: [], votes: [] });
        return id;
      },
      async setTripDestination(tripId, destination) {
        guardOrganizer(tripId).destination = destination;
      },
      async listInvites(tripId) {
        const now = Date.now();
        return guardOrganizer(tripId).invites.filter((i) => !i.revoked && Date.parse(i.expiresAt) > now).map(({ revoked: _r, ...i }) => i);
      },
      async getProfile() {
        return { displayName: myName };
      },
      async updateDisplayName(name) {
        myName = name;
        for (const t of trips) for (const m of t.members) if (m.userId === ME) m.displayName = name;
      },
      async leaveTrip(tripId) {
        const t = find(tripId);
        const me = t && meIn(t);
        if (!t || !me || me.status === "removed") throw new Error("you are not a member of this trip");
        if (soleOrganizer(t)) throw new Error("You are the only organizer. Make someone else an organizer or delete the trip first.");
        t.items = t.items.filter((i) => !(i.ownerId === ME && i.visibility === "private"));
        t.documents = t.documents.filter((d) => !(d.ownerId === ME && d.scope === "personal"));
        t.members = t.members.filter((m) => m.userId !== ME);
      },
      async setMemberRole(tripId, userId, role) {
        const t = guardOrganizer(tripId);
        const target = t.members.find((m) => m.userId === userId && m.status === "approved");
        if (!target) throw new Error("only approved members can have their role changed");
        if (role === "member" && !t.members.some((m) => m.role === "organizer" && m.status === "approved" && m.userId !== userId)) {
          throw new Error("this is the only organizer: make someone else an organizer first");
        }
        target.role = role;
      },
      async deleteTrip(tripId) {
        const t = guardOrganizer(tripId);
        trips.splice(trips.indexOf(t), 1);
      },
      async deleteAccount() {
        const blocked = trips.filter((t) => soleOrganizer(t) && t.members.some((m) => m.status === "approved" && m.userId !== ME));
        if (blocked.length > 0) {
          throw new Error(`You are the only organizer of ${blocked.map((t) => `"${t.name}"`).join(", ")}. Make someone else an organizer or delete the trip first.`);
        }
        for (const t of [...trips]) {
          if (!meIn(t)) continue;
          if (!t.members.some((m) => m.status === "approved" && m.userId !== ME)) trips.splice(trips.indexOf(t), 1);
          else t.members = t.members.filter((m) => m.userId !== ME);
        }
        setSignedIn(false);
      },
      async setEditRights(tripId, userId, allowed) {
        const target = guardOrganizer(tripId).members.find((m) => m.userId === userId);
        if (!target) throw new Error("member not found");
        target.canEditAll = allowed;
      },
    },
    clock: { now: () => (options.today ? Date.parse(zonedTimeToInstant(`${today}T12:00`, timeZone)) : Date.now()), timeZone },
    rates: createRateService({ provider: demoRates, store: createRateStore(null), source: "Sample" }),
    weather: createWeatherService({ provider: demoWeather, store: createWeatherStore(null), now: () => Date.now() }),
    geocoder: demoGeocoder,
  };
}

// Sample weather and places, so demo mode never touches the network.
const SAMPLE_WEATHER = [
  { hi: 31, lo: 24, summary: "Mostly clear" },
  { hi: 30, lo: 23, summary: "Partly cloudy" },
  { hi: 29, lo: 24, summary: "Showers" },
  { hi: 32, lo: 25, summary: "Clear" },
];
const demoWeather: WeatherProvider = {
  async forecast(_lat, _lon, date) {
    return SAMPLE_WEATHER[Number(date.slice(-2)) % SAMPLE_WEATHER.length]!;
  },
};
const SAMPLE_PLACES: Record<string, TripDestination> = {
  goa: { name: "Goa, India", lat: 15.49, lon: 73.83 },
  manali: { name: "Manali, India", lat: 32.24, lon: 77.19 },
  london: { name: "London, United Kingdom", lat: 51.51, lon: -0.13 },
};
const demoGeocoder: Geocoder = {
  async find(query) {
    return SAMPLE_PLACES[query.trim().toLowerCase().split(",")[0]!.trim()] ?? null;
  },
};

// Sample rates (units per US dollar), so demo mode never touches the network.
const PER_USD: Record<string, number> = { USD: 1, EUR: 0.89, GBP: 0.76, INR: 94.75, JPY: 152.4, AUD: 1.52, CAD: 1.39, SGD: 1.29, THB: 32.6, CHF: 0.8 };
const demoRates: RateProvider = {
  async getRate(from, to) {
    const a = PER_USD[from];
    const b = PER_USD[to];
    if (a === undefined || b === undefined) throw new RatesUnavailableError(`No sample rate for ${from} to ${to}`);
    return b / a;
  },
};
