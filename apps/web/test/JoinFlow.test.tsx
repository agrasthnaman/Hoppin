import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { describe, expect, it, vi } from "vitest";
import { JoinFlow } from "../src/routes/JoinFlow";

const TOKEN = "a1".repeat(32);

function setup(over: Partial<React.ComponentProps<typeof JoinFlow>> = {}) {
  const props = {
    token: TOKEN,
    signedInUserId: null,
    redirectTo: `https://hoppin.app/join/${TOKEN}`,
    resetRedirectTo: "https://hoppin.app/reset-password",
    auth: {
      signUp: vi.fn().mockResolvedValue({ confirmationNeeded: true }),
      signIn: vi.fn().mockResolvedValue(undefined),
      resendConfirmation: vi.fn().mockResolvedValue(undefined),
      requestPasswordReset: vi.fn().mockResolvedValue(undefined),
    },
    redeem: vi.fn().mockResolvedValue({ tripId: "trip1", status: "pending" }),
    onContinue: vi.fn(),
    ...over,
  };
  return { props, ...render(<JoinFlow {...props} />) };
}

describe("JoinFlow: signed out", () => {
  it("creates an account with name, email and password, then tells them to confirm their email", async () => {
    const { props } = setup();
    await userEvent.type(screen.getByLabelText("Your name"), "Neha");
    await userEvent.type(screen.getByLabelText("Email"), "neha@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "a long enough password");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(props.auth.signUp).toHaveBeenCalledWith({
      email: "neha@example.com",
      name: "Neha",
      password: "a long enough password",
      redirectTo: `https://hoppin.app/join/${TOKEN}`,
    });
    expect(await screen.findByText(/Check your email/)).toBeInTheDocument();
    expect(screen.getByText(/neha@example.com/)).toBeInTheDocument();
  });

  it("does not create the account when the name is empty, the email is invalid or the password is short", async () => {
    const { props } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByText("Enter your name")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Your name"), "Neha");
    await userEvent.type(screen.getByLabelText("Email"), "not-an-email");
    await userEvent.type(screen.getByLabelText("Password"), "short");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByText("Enter a valid email")).toBeInTheDocument();
    expect(screen.getByText("Use at least 10 characters")).toBeInTheDocument();
    expect(props.auth.signUp).not.toHaveBeenCalled();
  });

  it("lets someone who already has an account sign in instead", async () => {
    const { props } = setup();
    await userEvent.click(screen.getByRole("button", { name: "I already have an account" }));
    await userEvent.type(screen.getByLabelText("Email"), "neha@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "a long enough password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(props.auth.signIn).toHaveBeenCalledWith({ email: "neha@example.com", password: "a long enough password" });
  });

  it("shows an error and lets them try again when creating the account fails", async () => {
    const { props } = setup();
    vi.mocked(props.auth.signUp).mockRejectedValue(new Error("boom"));
    await userEvent.type(screen.getByLabelText("Your name"), "Neha");
    await userEvent.type(screen.getByLabelText("Email"), "neha@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "a long enough password");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't create your account just now");
    expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled();
  });

  it("has no accessibility violations", async () => {
    const { container } = setup();
    expect(await axe(container, { rules: { "color-contrast": { enabled: false } } })).toHaveNoViolations();
  });
});

describe("JoinFlow: signed in", () => {
  it("joins once and shows the waiting-for-approval message", async () => {
    const { props } = setup({ signedInUserId: "u1" });
    expect(await screen.findByText(/Waiting for the organizer to approve you/)).toBeInTheDocument();
    expect(props.redeem).toHaveBeenCalledTimes(1);
    expect(props.redeem).toHaveBeenCalledWith(TOKEN);
  });

  it("welcomes an approved member and opens the trip", async () => {
    const { props } = setup({ signedInUserId: "u1", redeem: vi.fn().mockResolvedValue({ tripId: "trip1", status: "approved" }) });
    await userEvent.click(await screen.findByRole("button", { name: "Open trip" }));
    expect(props.onContinue).toHaveBeenCalledWith("trip1");
  });

  it("tells a removed member they cannot join", async () => {
    setup({ signedInUserId: "u1", redeem: vi.fn().mockResolvedValue({ tripId: "trip1", status: "removed" }) });
    expect(await screen.findByText(/can't join this trip/)).toBeInTheDocument();
  });

  it("explains an invalid or expired link", async () => {
    setup({ signedInUserId: "u1", redeem: vi.fn().mockRejectedValue(new Error("invalid or expired invite")) });
    expect(await screen.findByText(/isn't valid anymore/)).toBeInTheDocument();
  });

  it("offers a retry for other errors", async () => {
    const redeem = vi.fn().mockRejectedValueOnce(new Error("network down")).mockResolvedValue({ tripId: "trip1", status: "pending" });
    setup({ signedInUserId: "u1", redeem });
    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText(/Waiting for the organizer/)).toBeInTheDocument());
    expect(redeem).toHaveBeenCalledTimes(2);
  });
});
