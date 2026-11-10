/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Cloudflare Turnstile site key (public). Leave empty to turn the bot check off. */
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  /** "true" runs the app on sample data (npm run demo). */
  readonly VITE_DEMO?: string;
}
