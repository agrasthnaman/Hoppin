import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AuthError } from "../src/lib/auth-api";
import { fakeServices, renderApp } from "./helpers";

const PASSWORD = "a long enough password";

async function openSignUp() {
  const { services } = fakeServices({ session: null });
  renderApp("/sign-in", services);
  await userEvent.click(await screen.findByRole("button", { name: "New here? Join the waitlist" }));
  return services;
}

async function submitSignUp() {
  await userEvent.type(screen.getByLabelText("Your name"), "Rahi");
  await userEvent.type(screen.getByLabelText("Email"), " Rahi@Example.com ");
  await userEvent.type(screen.getByLabelText("Password"), PASSWORD);
  await userEvent.click(screen.getByRole("button", { name: "Join the waitlist" }));
}

async function saveSpot() {
  expect(await screen.findByText("We're a little busy")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Save my spot" }));
}

const noErrorWords = () => expect(document.body.textContent ?? "").not.toMatch(/\b(error|failed|invalid|exception)\b/i);

describe("sign-up when the email limit is reached (the overflow queue)", () => {
  it("normal sign-up is unchanged: the queue is checked first, then the account is created, and nobody is queued", async () => {
    const services = await openSignUp();
    await submitSignUp();
    expect(await screen.findByText(/We sent a|An invite is on its way/)).toBeInTheDocument();
    expect(services.auth.queueStatus).toHaveBeenCalledWith("Rahi@Example.com");
    expect(services.auth.queueStatus.mock.invocationCallOrder[0]!).toBeLessThan(services.auth.signUp.mock.invocationCallOrder[0]!);
    expect(services.auth.joinQueue).not.toHaveBeenCalled();
  });

  it("over the limit: offers to save a spot, and nobody is queued until they choose to", async () => {
    const services = await openSignUp();
    services.auth.signUp.mockRejectedValueOnce(new AuthError("rate-limited", "email rate limit exceeded"));
    await submitSignUp();
    expect(await screen.findByText("We're a little busy")).toBeInTheDocument();
    expect(screen.getByText("We can't send emails for a little while. Save your spot and we'll send your sign-in link to Rahi@Example.com within the hour.")).toBeInTheDocument();
    expect(services.auth.joinQueue).not.toHaveBeenCalled();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Save my spot", "Back to sign in"]);
    noErrorWords();
  });

  it("saving the spot sends the email and name only, never the password, and says so calmly", async () => {
    const services = await openSignUp();
    services.auth.signUp.mockRejectedValueOnce(new AuthError("rate-limited", "email rate limit exceeded"));
    await submitSignUp();
    await saveSpot();
    expect(await screen.findByText("You're in the queue")).toBeInTheDocument();
    expect(services.auth.joinQueue).toHaveBeenCalledTimes(1);
    expect(services.auth.joinQueue).toHaveBeenCalledWith({ email: "Rahi@Example.com", name: "Rahi" });
    expect(JSON.stringify(services.auth.joinQueue.mock.calls)).not.toContain(PASSWORD);
    expect(
      screen.getByText("We're a little busy, so we saved your spot. Your sign-in link will arrive at Rahi@Example.com within the hour. You don't need to do anything else."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    // the only thing to press is the way back
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Back to sign in"]);
    noErrorWords();
  });

  it("someone already waiting is told so, and no new sign-up request is made at all", async () => {
    const services = await openSignUp();
    services.auth.queueStatus.mockResolvedValueOnce("waiting");
    await submitSignUp();
    expect(await screen.findByText("You're already in the queue")).toBeInTheDocument();
    expect(screen.getByText("We have your email and your link is on its way. No need to sign up again.")).toBeInTheDocument();
    expect(services.auth.signUp).not.toHaveBeenCalled();
    expect(services.auth.joinQueue).not.toHaveBeenCalled();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Back to sign in"]);
  });

  it("someone whose invite has already been sent gets the same calm answer", async () => {
    const services = await openSignUp();
    services.auth.queueStatus.mockResolvedValueOnce("invited");
    await submitSignUp();
    expect(await screen.findByText("You're already in the queue")).toBeInTheDocument();
    expect(services.auth.signUp).not.toHaveBeenCalled();
  });

  it("an email that already has an account is told so, without a sign-up request", async () => {
    const services = await openSignUp();
    services.auth.queueStatus.mockResolvedValueOnce("registered");
    await submitSignUp();
    expect(await screen.findByText("You already have an account")).toBeInTheDocument();
    expect(services.auth.signUp).not.toHaveBeenCalled();
    expect(services.auth.joinQueue).not.toHaveBeenCalled();
  });

  it("asking twice at the limit shows the already-in-queue message (the database says it already has them)", async () => {
    const services = await openSignUp();
    services.auth.signUp.mockRejectedValueOnce(new AuthError("rate-limited", "x"));
    services.auth.joinQueue.mockResolvedValueOnce("already_queued");
    await submitSignUp();
    await saveSpot();
    expect(await screen.findByText("You're already in the queue")).toBeInTheDocument();
  });

  it("a full queue says we are at capacity and to try again tomorrow", async () => {
    const services = await openSignUp();
    services.auth.signUp.mockRejectedValueOnce(new AuthError("rate-limited", "x"));
    services.auth.joinQueue.mockResolvedValueOnce("full");
    await submitSignUp();
    await saveSpot();
    expect(await screen.findByText("We're at capacity right now")).toBeInTheDocument();
    expect(screen.getByText(/Please try again tomorrow/)).toBeInTheDocument();
    noErrorWords();
  });

  it("an email that turns out to be registered while joining shows the account notice", async () => {
    const services = await openSignUp();
    services.auth.signUp.mockRejectedValueOnce(new AuthError("rate-limited", "x"));
    services.auth.joinQueue.mockResolvedValueOnce("registered");
    await submitSignUp();
    await saveSpot();
    expect(await screen.findByText("You already have an account")).toBeInTheDocument();
  });

  it("if the queue cannot be reached, the person sees a calm message, nothing technical, and can try again", async () => {
    const services = await openSignUp();
    services.auth.signUp.mockRejectedValueOnce(new AuthError("rate-limited", "x"));
    services.auth.joinQueue.mockRejectedValueOnce(new Error("network down"));
    await submitSignUp();
    await saveSpot();
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't add you just now. Please try again in a moment.");
    expect(document.body.textContent).not.toContain("network down");
    expect(screen.getByRole("button", { name: "Save my spot" })).toBeEnabled();
  });

  it("if the queue check itself cannot be made, sign-up simply carries on as normal", async () => {
    const services = await openSignUp();
    services.auth.queueStatus.mockRejectedValueOnce(new Error("offline"));
    await submitSignUp();
    await waitFor(() => expect(services.auth.signUp).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("other sign-up problems are not turned into queue entries", async () => {
    const services = await openSignUp();
    services.auth.signUp.mockRejectedValueOnce(new AuthError("other", "boom"));
    await submitSignUp();
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't add you just now");
    expect(services.auth.joinQueue).not.toHaveBeenCalled();
  });

  it("'Back to sign in' leaves the queue notice", async () => {
    const services = await openSignUp();
    services.auth.signUp.mockRejectedValueOnce(new AuthError("rate-limited", "x"));
    await submitSignUp();
    await saveSpot();
    await userEvent.click(await screen.findByRole("button", { name: "Back to sign in" }));
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });
});
