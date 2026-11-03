import { describe, expect, it } from "vitest";
import { readSupabaseEnv } from "../src/lib/supabase";

describe("readSupabaseEnv", () => {
  it("returns the address and key", () => {
    expect(readSupabaseEnv({ VITE_SUPABASE_URL: "https://x.supabase.co", VITE_SUPABASE_ANON_KEY: "k" })).toEqual({ url: "https://x.supabase.co", anonKey: "k" });
  });

  it("names exactly what is missing", () => {
    expect(() => readSupabaseEnv({})).toThrow("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY");
    expect(() => readSupabaseEnv({ VITE_SUPABASE_URL: "https://x.supabase.co" })).toThrow(/Missing VITE_SUPABASE_ANON_KEY/);
  });
});
