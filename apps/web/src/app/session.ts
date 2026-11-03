import { useEffect, useState } from "react";

type AuthSession = { user: { id: string; email?: string | null } } | null;

/** The slice of the Supabase auth client used here, so it can be faked in tests. */
export interface SessionClient {
  auth: {
    getSession(): PromiseLike<{ data: { session: AuthSession } }>;
    onAuthStateChange(cb: (event: string, session: AuthSession) => void): { data: { subscription: { unsubscribe(): void } } };
  };
}

export type SessionState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; userId: string; email: string | null };

const fromSession = (s: AuthSession): SessionState =>
  s ? { status: "signedIn", userId: s.user.id, email: s.user.email ?? null } : { status: "signedOut" };

/** Who is signed in, kept up to date as they sign in and out (including after clicking an emailed link). */
export function useSession(client: SessionClient): SessionState {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    void client.auth.getSession().then(({ data }) => alive && setState(fromSession(data.session)));
    const { data } = client.auth.onAuthStateChange((_event, session) => alive && setState(fromSession(session)));
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [client]);
  return state;
}
