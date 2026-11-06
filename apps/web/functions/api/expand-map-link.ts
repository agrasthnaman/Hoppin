import { resolveShortMapLink } from "../../src/lib/expand-map-link";

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

/**
 * Opens a short Google map link (maps.app.goo.gl/...) on our side and returns the full address, which holds the
 * coordinates. A browser cannot do this itself because Google does not allow other sites to read its redirects.
 * Only Google map links are followed (see `resolveShortMapLink`), and only requests from our own pages are answered.
 */
export async function expandMapLink(request: Request, fetchImpl?: Parameters<typeof resolveShortMapLink>[1]): Promise<Response> {
  if (request.headers.get("sec-fetch-site") === "cross-site") return json({ url: null }, 403);
  const target = new URL(request.url).searchParams.get("url") ?? "";
  try {
    const url = await resolveShortMapLink(target, fetchImpl);
    return url ? json({ url }, 200, { "cache-control": "public, max-age=86400" }) : json({ url: null }, 422);
  } catch {
    return json({ url: null }, 502);
  }
}

/** Cloudflare Pages Function: GET /api/expand-map-link?url=... */
export const onRequestGet = ({ request }: { request: Request }) => expandMapLink(request);
