import { describe, expect, it } from "vitest";
import { expandMapLink } from "../functions/api/expand-map-link";

const full = "https://www.google.com/maps/place/Uluwatu/@-8.8291,115.0849,17z";
const redirect = (location: string) => async () => ({ status: 302, headers: new Headers({ location }) });
const ask = (link: string, headers: Record<string, string> = {}) =>
  new Request(`https://hoppinclub.com/api/expand-map-link?url=${encodeURIComponent(link)}`, { headers });

describe("the short map link function", () => {
  it("returns the full address of a Google short link", async () => {
    const response = await expandMapLink(ask("https://maps.app.goo.gl/6mNLXEN6ewQYKyRe8"), async (url) =>
      url.startsWith("https://maps.app.goo.gl") ? { status: 302, headers: new Headers({ location: full }) } : { status: 200, headers: new Headers() },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: full });
    expect(response.headers.get("cache-control")).toContain("max-age");
  });

  it("refuses any address that is not a Google short link, without fetching it", async () => {
    let fetched = false;
    const response = await expandMapLink(ask("http://169.254.169.254/latest/meta-data"), async () => {
      fetched = true;
      return { status: 200, headers: new Headers() };
    });
    expect(response.status).toBe(422);
    expect(fetched).toBe(false);
  });

  it("does not follow a redirect that leaves Google", async () => {
    const response = await expandMapLink(ask("https://maps.app.goo.gl/6mNLXEN6ewQYKyRe8"), redirect("https://evil.example/x"));
    expect(response.status).toBe(422);
  });

  it("answers only requests from our own pages", async () => {
    const response = await expandMapLink(ask("https://maps.app.goo.gl/6mNLXEN6ewQYKyRe8", { "sec-fetch-site": "cross-site" }));
    expect(response.status).toBe(403);
  });

  it("answers the native app and says which origin may read the result", async () => {
    const response = await expandMapLink(
      ask("https://maps.app.goo.gl/6mNLXEN6ewQYKyRe8", { "sec-fetch-site": "cross-site", origin: "capacitor://localhost" }),
      async (url) => (url.startsWith("https://maps.app.goo.gl") ? { status: 302, headers: new Headers({ location: full }) } : { status: 200, headers: new Headers() }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("capacitor://localhost");
  });

  it("says so when Google cannot be reached", async () => {
    const response = await expandMapLink(ask("https://maps.app.goo.gl/6mNLXEN6ewQYKyRe8"), async () => {
      throw new Error("down");
    });
    expect(response.status).toBe(502);
  });
});
