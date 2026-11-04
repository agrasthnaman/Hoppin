import type { DocumentScope, DocumentSource, InviteApi, Item, TripDestination, TripDocument, TripSource } from "@hoppin/core";
import { createContext, useContext, type ReactNode } from "react";
import type { ItemFormValues } from "../components/ItemForm";
import { createAuthApi, type AuthApi } from "../lib/auth-api";
import { createInviteApi } from "../lib/invite-api";
import { getDocumentUrl, uploadDocument } from "../lib/documents";
import { createDocumentSource } from "../data/document-source";
import { createTripSource } from "../data/trip-source";
import { castVote, closePoll, createItem, createPoll, deletePoll, setRsvp, updateItem } from "../data/writes";
import { sharedOfflineDb, type OfflineDb } from "../offline/db";
import { createFrankfurterRates, createRateService, createRateStore, type RateService } from "../providers/rates";
import { createOpenMeteoGeocoder, createOpenMeteoWeather, createWeatherService, createWeatherStore, type Geocoder, type WeatherService } from "../providers/weather";
import type { SessionClient } from "./session";

/** Everything the screens do to the outside world. Real implementations use Supabase; tests pass fakes. */
export interface Actions {
  createItem(tripId: string, ownerId: string, values: ItemFormValues, id?: string): Promise<void>;
  updateItem(item: Item, values: ItemFormValues): Promise<void>;
  setRsvp(itemId: string, userId: string, going: boolean): Promise<void>;
  /** Asks the group a question. Needs a connection. Returns the poll's id. */
  createPoll(tripId: string, question: string, multiple: boolean, options: string[]): Promise<string>;
  /** Sets this person's choice on a poll (an empty list withdraws it). Needs a connection. */
  castVote(pollId: string, optionIds: string[]): Promise<void>;
  /** The person who asked, or an organizer, stops a poll taking votes. */
  closePoll(pollId: string): Promise<void>;
  deletePoll(pollId: string): Promise<void>;
  uploadDocument(file: File, meta: { tripId: string; ownerId: string; itemId: string | null; scope: DocumentScope; kind: string }): Promise<void>;
  /** A short-lived link to open a document online. */
  documentUrl(doc: TripDocument): Promise<string>;
  listTrips(): Promise<{ id: string; name: string; startDate?: string | null; endDate?: string | null }[]>;
  /** Creates a trip with the signed-in person as organizer. Returns its id. */
  createTrip(trip: { name: string; startDate: string | null; endDate: string | null; destination?: TripDestination | null }): Promise<string>;
  /** Organizer only: sets or clears where the trip goes (the weather follows it). */
  setTripDestination(tripId: string, destination: TripDestination | null): Promise<void>;
  /** Organizer only: invite links that are still usable (not stopped, not expired). */
  listInvites(tripId: string): Promise<{ id: string; token: string; createdAt: string; expiresAt: string }[]>;
  /** Organizer only: lets a member edit other people's plans, or stops that. */
  setEditRights(tripId: string, userId: string, allowed: boolean): Promise<void>;
  /** The signed-in person's name, as other members see it. */
  getProfile(): Promise<{ displayName: string }>;
  updateDisplayName(name: string): Promise<void>;
  /** Leave a trip (or withdraw a request to join). The person's own personal files in it are deleted first. */
  leaveTrip(tripId: string): Promise<void>;
  /** Organizer only: make an approved member an organizer, or step an organizer back to member. */
  setMemberRole(tripId: string, userId: string, role: "organizer" | "member"): Promise<void>;
  /** Organizer only: deletes the trip for everyone, including all its files. */
  deleteTrip(tripId: string): Promise<void>;
  /** Deletes the signed-in person's account (refused if they are the only organizer of a trip with other people). */
  deleteAccount(): Promise<void>;
}

export interface Services {
  db: OfflineDb;
  tripSource: TripSource;
  documentSource: DocumentSource;
  sessionClient: SessionClient;
  auth: AuthApi & { signOut(): Promise<void> };
  invites: InviteApi;
  actions: Actions;
  /** The current time and the device's time zone (replaceable in tests). */
  clock: { now(): number; timeZone: string };
  /** Exchange rates, cached on the device for offline use. */
  rates: RateService;
  /** Forecasts for a day at the trip's destination, kept on the device for offline use. */
  weather: WeatherService;
  /** Turns a typed place name into coordinates, once, when a destination is set. */
  geocoder: Geocoder;
}

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({ services, children }: { services: Services; children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error("useServices must be used inside a ServicesProvider");
  return services;
}

/** The real services, built on a Supabase client. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createServices(client: any): Services {
  const auth = createAuthApi(client);
  const signedInId = async (): Promise<string> => {
    const { data } = await client.auth.getSession();
    const id = data.session?.user.id;
    if (!id) throw new Error("Not signed in");
    return id;
  };
  /** Storage paths of the document records a query selects. */
  const filePaths = async (where: (query: any) => any): Promise<string[]> => {
    const { data, error } = await where(client.from("documents").select("storage_path"));
    if (error) throw new Error(error.message);
    return ((data ?? []) as { storage_path: string }[]).map((d) => d.storage_path);
  };
  const removeFiles = async (paths: string[]): Promise<void> => {
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await client.storage.from("trip-documents").remove(paths.slice(i, i + 100));
      if (error) throw new Error(error.message);
    }
  };
  return {
    db: sharedOfflineDb(),
    tripSource: createTripSource(client),
    documentSource: createDocumentSource(client),
    sessionClient: client,
    auth: { ...auth, signOut: async () => void (await client.auth.signOut()) },
    invites: createInviteApi(client),
    actions: {
      createItem: async (tripId, ownerId, values, id) => void (await createItem(client, tripId, ownerId, values, id)),
      updateItem: async (item, values) => void (await updateItem(client, item, values)),
      setRsvp: (itemId, userId, going) => setRsvp(client, itemId, userId, going),
      createPoll: (tripId, question, multiple, options) => createPoll(client, tripId, question, multiple, options),
      castVote: (pollId, optionIds) => castVote(client, pollId, optionIds),
      closePoll: (pollId) => closePoll(client, pollId),
      deletePoll: (pollId) => deletePoll(client, pollId),
      uploadDocument: async (file, meta) => void (await uploadDocument(client, file, meta)),
      documentUrl: (doc) => getDocumentUrl(client, doc),
      listTrips: async () => {
        const { data, error } = await client.from("trips").select("id, name, start_date, end_date").order("created_at", { ascending: false });
        if (error) throw new Error(error.message);
        return ((data ?? []) as { id: string; name: string; start_date: string | null; end_date: string | null }[]).map((t) => ({
          id: t.id,
          name: t.name,
          startDate: t.start_date,
          endDate: t.end_date,
        }));
      },
      createTrip: async ({ name, startDate, endDate, destination }) => {
        const { data, error } = await client.rpc("create_trip", {
          p_name: name,
          p_start: startDate,
          p_end: endDate,
          p_destination: destination?.name ?? null,
          p_destination_lat: destination?.lat ?? null,
          p_destination_lon: destination?.lon ?? null,
        });
        if (error) throw new Error(error.message);
        return data as string;
      },
      setTripDestination: async (tripId, destination) => {
        const { data, error } = await client
          .from("trips")
          .update({ destination: destination?.name ?? null, destination_lat: destination?.lat ?? null, destination_lon: destination?.lon ?? null })
          .eq("id", tripId)
          .select();
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) throw new Error("Could not change the destination");
      },
      listInvites: async (tripId) => {
        const { data, error } = await client.from("invites").select("id, token, created_at, expires_at, revoked_at").eq("trip_id", tripId);
        if (error) throw new Error(error.message);
        const now = Date.now();
        return ((data ?? []) as { id: string; token: string; created_at: string; expires_at: string; revoked_at: string | null }[])
          .filter((i) => !i.revoked_at && Date.parse(i.expires_at) > now)
          .map((i) => ({ id: i.id, token: i.token, createdAt: i.created_at, expiresAt: i.expires_at }));
      },
      setEditRights: async (tripId, userId, allowed) => {
        const { data, error } = await client.from("members").update({ can_edit_all: allowed }).eq("trip_id", tripId).eq("user_id", userId).select();
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) throw new Error("Could not change edit rights");
      },
      getProfile: async () => {
        const me = await signedInId();
        const { data, error } = await client.from("profiles").select("display_name").eq("user_id", me).single();
        if (error) throw new Error(error.message);
        return { displayName: (data as { display_name: string }).display_name };
      },
      updateDisplayName: async (name) => {
        const me = await signedInId();
        const { data, error } = await client.from("profiles").update({ display_name: name }).eq("user_id", me).select();
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) throw new Error("Could not save the name");
      },
      leaveTrip: async (tripId) => {
        const me = await signedInId();
        await removeFiles(await filePaths((q) => q.eq("trip_id", tripId).eq("owner_id", me).eq("scope", "personal")));
        const { error } = await client.rpc("leave_trip", { p_trip: tripId });
        if (error) throw new Error(error.message);
      },
      setMemberRole: async (tripId, userId, role) => {
        const { error } = await client.rpc("set_member_role", { p_trip: tripId, p_user: userId, p_role: role });
        if (error) throw new Error(error.message);
      },
      deleteTrip: async (tripId) => {
        await removeFiles(await filePaths((q) => q.eq("trip_id", tripId)));
        const { data, error } = await client.from("trips").delete().eq("id", tripId).select();
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) throw new Error("Could not delete the trip");
      },
      deleteAccount: async () => {
        const me = await signedInId();
        // Refuse first, before any file is touched, so a refusal leaves nothing broken.
        const { data: blocked, error: blockedError } = await client.rpc("my_account_blockers");
        if (blockedError) throw new Error(blockedError.message);
        const names = (blocked ?? []) as string[];
        if (names.length > 0) {
          throw new Error(`You are the only organizer of ${names.map((n) => `"${n}"`).join(", ")}. Make someone else an organizer or delete the trip first.`);
        }
        await removeFiles(await filePaths((q) => q.eq("owner_id", me).eq("scope", "personal")));
        const { error } = await client.rpc("delete_my_account");
        if (error) throw new Error(error.message);
      },
    },
    clock: { now: () => Date.now(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    rates: createRateService({ provider: createFrankfurterRates(), store: createRateStore() }),
    weather: createWeatherService({ provider: createOpenMeteoWeather(), store: createWeatherStore() }),
    geocoder: createOpenMeteoGeocoder(),
  };
}
