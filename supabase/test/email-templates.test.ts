import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(join(process.cwd(), "email-templates", name), "utf8");

describe("confirm signup email", () => {
  const html = read("confirm-signup.html");

  it("welcomes them onto the list and calls the link an invite", () => {
    expect(html).toContain("You're on the list");
    expect(html).toContain("Open my invite");
    expect(html).toContain("Welcome to the waitlist");
  });
});

describe.each(["confirm-signup.html", "recovery.html"])("email template %s", (name) => {
  const html = read(name);

  it("links to our own domain, not to the auth provider, in the button and the fallback link (and shows it as text)", () => {
    expect(html).not.toContain("ConfirmationURL");
    const links = html.match(/\{\{ \.SiteURL \}\}\/auth\/confirm\?token_hash=\{\{ \.TokenHash \}\}&type=(signup|recovery)/g);
    expect(links).toHaveLength(3);
  });

  it("makes the fallback link readable on the blue background: a real link, underlined, in a light colour", () => {
    const fallback = html.slice(html.indexOf("Button not working?"));
    const anchor = fallback.match(/<a [^>]*>/)?.[0] ?? "";
    expect(anchor).toContain("text-decoration:underline");
    expect(anchor).toMatch(/color:#(ffd2c6|ffb8a3|ff6b4a|f6f3ec)/i);
  });

  it("is safe and simple: no scripts, no remote images, no forms", () => {
    expect(html).not.toMatch(/<script|<img|<form|<iframe|<link/i);
  });

  it("is small enough for any mail app", () => {
    expect(html.length).toBeLessThan(5000);
  });

  it("says the link works once and lasts 24 hours", () => {
    expect(html).toContain("works once and expires in 24 hours");
  });

  it("names the app and says what to do if the person did not ask", () => {
    expect(html).toContain("Hoppin");
    expect(html).toContain("If you didn't ask for this email");
  });
});
