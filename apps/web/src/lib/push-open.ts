import { toAppPath } from "./app-link";

/** The in-app path a tapped notification should open, or null when the link is missing or not ours. */
export function pathFromPush(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  if (!("url" in data) || typeof data.url !== "string") return null;
  const url = data.url;
  if (url.startsWith("/")) return toAppPath(`https://hoppinclub.com${url}`);
  return toAppPath(url);
}
