import { createClient } from "@supabase/supabase-js";

export interface SupabaseEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

/** Reads the Supabase address and public key from the environment, with a clear error if they are missing. */
export function readSupabaseEnv(env: SupabaseEnv): { url: string; anonKey: string } {
  const missing = (["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"] as const).filter((name) => !env[name]);
  if (missing.length > 0) throw new Error(`Missing ${missing.join(" and ")}. Copy apps/web/.env.example to apps/web/.env.local and fill it in.`);
  return { url: env.VITE_SUPABASE_URL as string, anonKey: env.VITE_SUPABASE_ANON_KEY as string };
}

/**
 * The app signs people in only with a password or by verifying an emailed token_hash on /auth/confirm, so a session is
 * never read from the address bar: otherwise any link carrying someone else's tokens would silently switch accounts.
 */
export function createSupabaseClient(env: SupabaseEnv) {
  const { url, anonKey } = readSupabaseEnv(env);
  return createClient(url, anonKey, { auth: { detectSessionInUrl: false } });
}
