import { apiBase } from "./native-shell";

/** A Google short map link, which hides its coordinates until it is opened. */
export function isShortMapLink(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password) return false;
    const host = parsed.hostname.toLowerCase();
    if (host === "maps.app.goo.gl") return /^\/[A-Za-z0-9_-]{8,}$/.test(parsed.pathname);
    if (host === "goo.gl") return /^\/maps\/[A-Za-z0-9_-]{4,}$/.test(parsed.pathname);
    return false;
  } catch {
    return false;
  }
}

function allowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "maps.app.goo.gl" || host === "goo.gl" || host === "google.com" || host.endsWith(".google.com") || host.endsWith(".google.co.in");
}

function isBlockPage(url: URL): boolean {
  return /^\/(sorry|consent|ServiceLogin)(\/|$)/i.test(url.pathname) || url.hostname.toLowerCase().startsWith("consent.") || url.hostname.toLowerCase().startsWith("accounts.");
}

function blockedDestination(blockPage: URL): string | null {
  const raw = blockPage.searchParams.get("continue");
  if (!raw) return null;
  try {
    const target = new URL(raw);
    if (target.protocol !== "https:" || !allowedHost(target.hostname) || isBlockPage(target)) return null;
    return target.href;
  } catch {
    return null;
  }
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Pick<Response, "status" | "headers">>;

/** Follow a short map link to the full address. Other addresses are refused. */
export async function resolveShortMapLink(url: string, fetchImpl: FetchLike = fetch): Promise<string | null> {
  let current = url.trim();
  if (!isShortMapLink(current)) return null;
  for (let hop = 0; hop < 5; hop += 1) {
    const response = await fetchImpl(current, { redirect: "manual", headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0" } });
    const location = response.headers.get("location");
    if (!location || response.status < 300 || response.status >= 400) return isShortMapLink(current) ? null : current;
    const next = new URL(location, current);
    if (next.protocol !== "https:" && next.protocol !== "http:") return null;
    if (!allowedHost(next.hostname)) return null;
    // Google's "unusual traffic" block page is not a place. Saving it would put a useless link on the trip.
    // The block page carries the address it was meant to show. Use that one, if it is a real Google map address.
    if (isBlockPage(next)) {
      const inner = blockedDestination(next);
      return inner && !isShortMapLink(inner) ? inner : null;
    }
    current = next.href;
  }
  return isShortMapLink(current) ? null : current;
}

/** Ask this app to open a short map link. The coordinates come back in the full address. */
export async function expandMapLink(url: string, native = false): Promise<string | null> {
  if (!isShortMapLink(url)) return null;
  try {
    const response = await fetch(`${apiBase(native)}/api/expand-map-link?url=${encodeURIComponent(url.trim())}`);
    if (!response.ok) return null;
    const body = (await response.json()) as { url?: unknown };
    return typeof body.url === "string" && body.url.startsWith("http") ? body.url : null;
  } catch {
    return null;
  }
}
