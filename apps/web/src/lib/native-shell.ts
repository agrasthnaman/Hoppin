/** The public site. The native shell has no same-origin `/api`, so it calls this. */
const SITE = "https://hoppinclub.com";

/** Empty on the website (relative `/api` stays on this host). The site origin inside the iOS/Android shell. */
export function apiBase(native: boolean): string {
  return native ? SITE : "";
}

/** The website's service worker must not run inside the shell, where it would cache over the bundled files. */
export function shouldRegisterServiceWorker(native: boolean): boolean {
  return !native;
}
