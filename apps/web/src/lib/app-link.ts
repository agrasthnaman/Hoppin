const SITE = "hoppinclub.com";

function allowed(path: string): boolean {
  return path.startsWith("/join/") || path.startsWith("/auth/") || path === "/reset-password" || path.startsWith("/reset-password/") || path.startsWith("/trips/");
}

/**
 * The in-app path for a hoppinclub.com link (invite, confirm, reset, trip), query and hash included.
 * Any other path on our site opens home. Any other host is ignored.
 */
export function toAppPath(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== SITE) return null;
  if (!allowed(parsed.pathname)) return "/";
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
