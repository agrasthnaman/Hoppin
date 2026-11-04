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

  it("contains the link twice (button and plain fallback)", () => {
    expect(html.match(/\{\{ \.ConfirmationURL \}\}/g)).toHaveLength(2);
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
