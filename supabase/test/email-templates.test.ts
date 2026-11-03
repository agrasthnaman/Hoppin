import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(join(process.cwd(), "email-templates", name), "utf8");

describe.each(["magic-link.html", "confirm-signup.html"])("email template %s", (name) => {
  const html = read(name);

  it("contains the sign-in link twice (button and plain fallback)", () => {
    expect(html.match(/\{\{ \.ConfirmationURL \}\}/g)).toHaveLength(2);
  });

  it("is safe and simple: no scripts, no remote images, no forms", () => {
    expect(html).not.toMatch(/<script|<img|<form|<iframe|<link/i);
  });

  it("is small enough for any mail app", () => {
    expect(html.length).toBeLessThan(5000);
  });

  it("names the app and says what to do if the person did not ask", () => {
    expect(html).toContain("Hoppin");
    expect(html).toContain("If you didn't ask for this email");
  });
});
