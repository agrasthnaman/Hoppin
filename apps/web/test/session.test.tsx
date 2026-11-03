import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSession, type SessionClient } from "../src/app/session";

type Listener = (event: string, session: { user: { id: string; email?: string } } | null) => void;

function fakeClient(initial: { user: { id: string; email?: string } } | null) {
  let listener: Listener = () => {};
  const unsubscribe = vi.fn();
  const client: SessionClient = {
    auth: {
      getSession: async () => ({ data: { session: initial } }),
      onAuthStateChange: (cb) => {
        listener = cb;
        return { data: { subscription: { unsubscribe } } };
      },
    },
  };
  return { client, emit: (event: string, session: Parameters<Listener>[1]) => listener(event, session), unsubscribe };
}

describe("useSession", () => {
  it("starts loading, then says signed out when there is no session", async () => {
    const { client } = fakeClient(null);
    const { result } = renderHook(() => useSession(client));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("signedOut"));
  });

  it("says signed in, with the person's id and email, when a session exists", async () => {
    const { client } = fakeClient({ user: { id: "u1", email: "a@b.co" } });
    const { result } = renderHook(() => useSession(client));
    await waitFor(() => expect(result.current).toEqual({ status: "signedIn", userId: "u1", email: "a@b.co" }));
  });

  it("follows sign in and sign out events", async () => {
    const { client, emit } = fakeClient(null);
    const { result } = renderHook(() => useSession(client));
    await waitFor(() => expect(result.current.status).toBe("signedOut"));
    act(() => emit("SIGNED_IN", { user: { id: "u2" } }));
    expect(result.current).toEqual({ status: "signedIn", userId: "u2", email: null });
    act(() => emit("SIGNED_OUT", null));
    expect(result.current.status).toBe("signedOut");
  });

  it("stops listening when the screen goes away", async () => {
    const { client, unsubscribe } = fakeClient(null);
    const { unmount } = renderHook(() => useSession(client));
    await waitFor(() => expect(client.auth.getSession).toBeDefined());
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
