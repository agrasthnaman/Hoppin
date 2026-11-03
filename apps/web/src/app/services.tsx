import type { DocumentScope, DocumentSource, InviteApi, Item, TripDocument, TripSource } from "@hoppin/core";
import { createContext, useContext, type ReactNode } from "react";
import type { ItemFormValues } from "../components/ItemForm";
import { createAuthApi } from "../lib/auth-api";
import { createInviteApi } from "../lib/invite-api";
import { getDocumentUrl, uploadDocument } from "../lib/documents";
import { createDocumentSource } from "../data/document-source";
import { createTripSource } from "../data/trip-source";
import { createItem, setRsvp, updateItem } from "../data/writes";
import { sharedOfflineDb, type OfflineDb } from "../offline/db";
import type { SessionClient } from "./session";

/** Everything the screens do to the outside world. Real implementations use Supabase; tests pass fakes. */
export interface Actions {
  createItem(tripId: string, ownerId: string, values: ItemFormValues): Promise<void>;
  updateItem(item: Item, values: ItemFormValues): Promise<void>;
  setRsvp(itemId: string, userId: string, going: boolean): Promise<void>;
  uploadDocument(file: File, meta: { tripId: string; ownerId: string; itemId: string | null; scope: DocumentScope; kind: string }): Promise<void>;
  /** A short-lived link to open a document online. */
  documentUrl(doc: TripDocument): Promise<string>;
  listTrips(): Promise<{ id: string; name: string }[]>;
}

export interface Services {
  db: OfflineDb;
  tripSource: TripSource;
  documentSource: DocumentSource;
  sessionClient: SessionClient;
  auth: {
    sendMagicLink(args: { email: string; name: string; redirectTo: string }): Promise<void>;
    signIn(args: { email: string; redirectTo: string }): Promise<void>;
    signOut(): Promise<void>;
  };
  invites: InviteApi;
  actions: Actions;
  /** The current time and the device's time zone (replaceable in tests). */
  clock: { now(): number; timeZone: string };
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
  return {
    db: sharedOfflineDb(),
    tripSource: createTripSource(client),
    documentSource: createDocumentSource(client),
    sessionClient: client,
    auth: { ...auth, signOut: async () => void (await client.auth.signOut()) },
    invites: createInviteApi(client),
    actions: {
      createItem: async (tripId, ownerId, values) => void (await createItem(client, tripId, ownerId, values)),
      updateItem: async (item, values) => void (await updateItem(client, item, values)),
      setRsvp: (itemId, userId, going) => setRsvp(client, itemId, userId, going),
      uploadDocument: async (file, meta) => void (await uploadDocument(client, file, meta)),
      documentUrl: (doc) => getDocumentUrl(client, doc),
      listTrips: async () => {
        const { data, error } = await client.from("trips").select("id, name").order("created_at", { ascending: false });
        if (error) throw new Error(error.message);
        return (data ?? []) as { id: string; name: string }[];
      },
    },
    clock: { now: () => Date.now(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
  };
}
