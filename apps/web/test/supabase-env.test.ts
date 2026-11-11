import { afterEach, describe, expect, it, vi } from "vitest";
import { createSupabaseClient, readSupabaseEnv } from "../src/lib/supabase";

describe("readSupabaseEnv", () => {
  it("returns the address and key", () => {
    expect(readSupabaseEnv({ VITE_SUPABASE_URL: "https://x.supabase.co", VITE_SUPABASE_ANON_KEY: "k" })).toEqual({ url: "https://x.supabase.co", anonKey: "k" });
  });

  it("names exactly what is missing", () => {
    expect(() => readSupabaseEnv({})).toThrow("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY");
    expect(() => readSupabaseEnv({ VITE_SUPABASE_URL: "https://x.supabase.co" })).toThrow(/Missing VITE_SUPABASE_ANON_KEY/);
  });
});

describe("createSupabaseClient", () => {
  const storageKey = "sb-dummyref-auth-token";
  const mine = {
    access_token: "mine-access",
    refresh_token: "mine-refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated" },
  };

  afterEach(() => {
    localStorage.clear();
    window.history.replaceState(null, "", "/");
    vi.unstubAllGlobals();
  });

  it.each([
    ["fragment", "/trips#access_token=theirs&refresh_token=theirs-refresh&expires_in=3600&token_type=bearer"],
    ["query string", "/join/abc?access_token=theirs&refresh_token=theirs-refresh&expires_in=3600&token_type=bearer"],
  ])("keeps the signed-in session when a link carries someone else's tokens in the %s", async (_where, path) => {
    localStorage.setItem(storageKey, JSON.stringify(mine));
    window.history.replaceState(null, "", path);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const client = createSupabaseClient({ VITE_SUPABASE_URL: "https://dummyref.supabase.co", VITE_SUPABASE_ANON_KEY: "k" });
    const { data } = await client.auth.getSession();

    expect(data.session?.user.id).toBe(mine.user.id);
    expect(JSON.parse(localStorage.getItem(storageKey) ?? "{}").refresh_token).toBe("mine-refresh");
    expect(fetch).not.toHaveBeenCalled();
  });
});
