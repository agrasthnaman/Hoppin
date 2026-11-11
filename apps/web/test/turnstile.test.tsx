import { act, render, screen, waitFor } from "@testing-library/react";
import { Capacitor } from "@capacitor/core";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthForm } from "../src/components/AuthForm";
import { AuthError } from "../src/lib/auth-api";

const fake = vi.hoisted(() => ({
  options: null as Record<string, unknown> | null,
  render: vi.fn(),
  reset: vi.fn(),
  remove: vi.fn(),
  load: vi.fn(),
}));
vi.mock("../src/lib/turnstile", () => ({
  TURNSTILE_SITE_KEY: "",
  loadTurnstile: fake.load,
}));

function api(over: Record<string, unknown> = {}) {
  return {
    signUp: vi.fn().mockResolvedValue({ confirmationNeeded: true }),
    signIn: vi.fn().mockResolvedValue(undefined),
    resendConfirmation: vi.fn().mockResolvedValue(undefined),
    requestPasswordReset: vi.fn().mockResolvedValue(undefined),
    queueStatus: vi.fn().mockResolvedValue("none"),
    joinQueue: vi.fn().mockResolvedValue("queued"),
    ...over,
  };
}

const show = (a: ReturnType<typeof api>, siteKey = "") =>
  render(<AuthForm api={a} confirmRedirectTo="https://x/c" resetRedirectTo="https://x/r" captchaSiteKey={siteKey} />);

async function signIn() {
  await userEvent.type(screen.getByLabelText("Email"), "neha@example.com");
  await userEvent.type(screen.getByLabelText("Password"), "a long enough password");
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

const give = (token: string) => act(() => (fake.options!.callback as (t: string) => void)(token));

beforeEach(() => {
  fake.options = null;
  fake.render.mockReset().mockImplementation((_el: HTMLElement, options: Record<string, unknown>) => {
    fake.options = options;
    return "widget-1";
  });
  fake.reset.mockReset();
  fake.remove.mockReset();
  fake.load.mockReset().mockResolvedValue({ render: fake.render, reset: fake.reset, remove: fake.remove });
});

describe("the bot check on the sign-in forms", () => {
  it("is off without a site key: nothing is loaded and requests carry no token", async () => {
    const a = api();
    show(a);
    await signIn();
    expect(fake.load).not.toHaveBeenCalled();
    expect(a.signIn).toHaveBeenCalledWith({ email: "neha@example.com", password: "a long enough password" });
  });

  it("waits for the check, then sends its token with the request, and asks for a fresh one", async () => {
    const a = api();
    show(a, "site-key");
    await waitFor(() => expect(fake.render).toHaveBeenCalled());
    expect(fake.options).toMatchObject({ sitekey: "site-key", appearance: "interaction-only" });
    await signIn();
    expect(a.signIn).not.toHaveBeenCalled(); // the check has not finished
    const wait = screen.getByText(/checking that you're a person/);
    expect(wait).toBeInTheDocument();
    // A wait is not an error: it uses the neutral info style, not the red conflict style.
    expect(wait.closest("[role]")).toHaveAttribute("role", "status");
    expect(wait.closest("div")).toHaveClass("bg-info-bg", "text-info-fg");
    expect(wait.closest("div")).not.toHaveClass("bg-danger-bg");
    give("token-1");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(a.signIn).toHaveBeenCalledWith({ email: "neha@example.com", password: "a long enough password", captchaToken: "token-1" }));
    await waitFor(() => expect(fake.reset).toHaveBeenCalledWith("widget-1")); // a token works once
  });

  it("sends the token when creating an account and when asking for a reset link", async () => {
    const a = api();
    show(a, "site-key");
    await waitFor(() => expect(fake.render).toHaveBeenCalled());
    give("t-signup");
    await userEvent.click(screen.getByRole("button", { name: /New here/ }));
    await userEvent.type(screen.getByLabelText("Your name"), "Neha");
    await userEvent.type(screen.getByLabelText("Email"), "neha@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "a long enough password");
    await userEvent.click(screen.getByRole("button", { name: /Join the waitlist|Create account/ }));
    await waitFor(() => expect(a.signUp).toHaveBeenCalledWith(expect.objectContaining({ captchaToken: "t-signup" })));
  });

  it("saving a spot in the queue uses a fresh token of its own, not the one the sign-up used", async () => {
    const a = api({ signUp: vi.fn().mockRejectedValue(new AuthError("rate-limited", "email rate limit exceeded")) });
    show(a, "site-key");
    await waitFor(() => expect(fake.render).toHaveBeenCalled());
    give("t-signup");
    await userEvent.click(screen.getByRole("button", { name: /New here/ }));
    await userEvent.type(screen.getByLabelText("Your name"), "Neha");
    await userEvent.type(screen.getByLabelText("Email"), "neha@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "a long enough password");
    await userEvent.click(screen.getByRole("button", { name: /Join the waitlist|Create account/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Save my spot" }));
    expect(a.joinQueue).not.toHaveBeenCalled(); // the sign-up's token is used up; wait for the next
    give("t-queue");
    await userEvent.click(screen.getByRole("button", { name: "Save my spot" }));
    await waitFor(() => expect(a.joinQueue).toHaveBeenCalledWith({ email: "neha@example.com", name: "Neha", captchaToken: "t-queue" }));
  });

  it("stops waiting if the check cannot run (a blocked script), and explains a refusal in plain words", async () => {
    fake.load.mockRejectedValue(new Error("blocked"));
    const a = api({ signIn: vi.fn().mockRejectedValue(new AuthError("captcha", "captcha verification process failed")) });
    show(a, "site-key");
    await signIn();
    expect(a.signIn).toHaveBeenCalledWith({ email: "neha@example.com", password: "a long enough password" });
    expect(await screen.findByText(/couldn't confirm that you're a person/)).toBeInTheDocument();
  });

  it("in the installed app the refusal does not talk about refreshing a page", async () => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    fake.load.mockRejectedValue(new Error("blocked"));
    const a = api({ signIn: vi.fn().mockRejectedValue(new AuthError("captcha", "captcha verification process failed")) });
    show(a, "site-key");
    await signIn();
    expect(await screen.findByText(/couldn't verify this device/)).toBeInTheDocument();
    expect(screen.queryByText(/Refresh the page/)).toBeNull();
    vi.restoreAllMocks();
  });

  it("removes the widget when the form goes away", async () => {
    const view = show(api(), "site-key");
    await waitFor(() => expect(fake.render).toHaveBeenCalled());
    view.unmount();
    expect(fake.remove).toHaveBeenCalledWith("widget-1");
  });
});
