import { MIN_PASSWORD_LENGTH, validatePassword } from "@hoppin/core";
import { useId, useState, type FormEvent } from "react";
import { AuthError, type AuthApi } from "../lib/auth-api";
import { inputClass } from "../lib/forms";
import { Banner } from "./ui/Banner";
import { Button } from "./ui/Button";

export type AuthFormApi = Pick<AuthApi, "signUp" | "signIn" | "resendConfirmation" | "requestPasswordReset">;

type Mode = "signin" | "signup" | "forgot";
type Sent = { kind: "confirm" | "reset"; email: string } | null;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Field({ label, hint, error, ...input }: { label: string; hint?: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input {...input} id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={inputClass} />
      {hint && !error && (
        <span id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} className="text-sm text-danger-fg">
          {error}
        </span>
      )}
    </div>
  );
}

function explain(error: unknown, mode: Mode, purpose: "waitlist" | "trip"): string {
  const code = error instanceof AuthError ? error.code : "other";
  if (code === "invalid-credentials") return "That email and password don't match. Check them and try again, or reset your password.";
  if (code === "rate-limited") return "We're a little busy right now. Nothing is lost. Please try again in about an hour.";
  if (code === "weak-password" && error instanceof Error) return error.message;
  if (mode === "signup") return purpose === "waitlist" ? "We couldn't add you just now. Please try again in a moment." : "We couldn't create your account just now. Please try again in a moment.";
  if (mode === "forgot") return "We couldn't send that email just now. Please try again in a moment.";
  return "We couldn't sign you in just now. Please try again in a moment.";
}

/**
 * Sign in with a password, create an account (the email link only confirms the address), or ask for a reset link.
 * Used on the sign-in page and on the invite page.
 */
export function AuthForm({
  api,
  confirmRedirectTo,
  resetRedirectTo,
  initialMode = "signin",
  purpose = "trip",
  titled = false,
}: {
  api: AuthFormApi;
  /** Where the confirmation link brings the person back to. */
  confirmRedirectTo: string;
  /** Where the reset link brings the person to (the reset-password page). */
  resetRedirectTo: string;
  initialMode?: Mode;
  /** Public sign-in frames a new account as joining the waitlist. A trip invite stays a normal account. */
  purpose?: "waitlist" | "trip";
  /** Draw the landing-page headline. The trip join page brings its own. */
  titled?: boolean;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Sent>(null);
  const [resent, setResent] = useState(false);

  function switchTo(next: Mode) {
    setMode(next);
    setErrors({});
    setFailure(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = email.trim();
    const next: typeof errors = {
      name: mode === "signup" && !name.trim() ? "Enter your name" : undefined,
      email: EMAIL.test(trimmed) ? undefined : "Enter a valid email",
    };
    if (mode === "signup") {
      const check = validatePassword(password);
      if (!check.ok) next.password = check.reason;
    } else if (mode === "signin" && !password) next.password = "Enter your password";
    setErrors(next);
    setFailure(null);
    if (next.name || next.email || next.password) return;
    setBusy(true);
    try {
      if (mode === "signup") {
        const { confirmationNeeded } = await api.signUp({ email: trimmed, password, name: name.trim(), redirectTo: confirmRedirectTo });
        if (confirmationNeeded) setSent({ kind: "confirm", email: trimmed });
      } else if (mode === "signin") {
        await api.signIn({ email: trimmed, password });
      } else {
        await api.requestPasswordReset({ email: trimmed, redirectTo: resetRedirectTo });
        setSent({ kind: "reset", email: trimmed });
      }
    } catch (error) {
      if (error instanceof AuthError && error.code === "email-not-confirmed") setSent({ kind: "confirm", email: trimmed });
      else setFailure(explain(error, mode, purpose));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!sent) return;
    setBusy(true);
    setFailure(null);
    try {
      await api.resendConfirmation({ email: sent.email, redirectTo: confirmRedirectTo });
      setResent(true);
    } catch (error) {
      setFailure(explain(error, "signup", purpose));
    } finally {
      setBusy(false);
    }
  }

  const joinLabel = purpose === "waitlist" ? "Join the waitlist" : "Create account";
  const headline = sent
    ? sent.kind === "confirm" && purpose === "waitlist"
      ? "You're on the list"
      : "Check your email"
    : mode === "signup"
      ? joinLabel
      : mode === "forgot"
        ? "Reset your password"
        : "Hop back in";
  const lede = sent
    ? null
    : mode === "signup" && purpose === "waitlist"
      ? "We're letting people in a few at a time. Leave your name and an invite lands in your inbox."
      : mode === "signin"
        ? "The group trip is still here. Hop back in with your email."
        : mode === "forgot"
          ? "We'll email a link to choose a new password."
          : null;

  const fields = sent ? (
    <div className="flex flex-col gap-3">
      {!titled && <p className="text-lg font-semibold">{sent.kind === "confirm" && purpose === "waitlist" ? "You're on the list" : "Check your email"}</p>}
      {sent.kind === "confirm" ? (
        <>
          <p className="text-muted">
            {purpose === "waitlist"
              ? `Welcome to the waitlist. An invite is on its way to ${sent.email}. It works once and expires in 24 hours. Open it, then hop in with your password.`
              : `We sent a confirmation link to ${sent.email}. It works once and expires in 24 hours. After you open it, sign in with your password.`}
          </p>
          {resent && (
            <p role="status">{purpose === "waitlist" ? "A fresh invite is on its way. The old one no longer works." : "A new link is on its way. The old one no longer works."}</p>
          )}
          {failure && <Banner kind="conflict" text={failure} />}
          <Button type="button" variant="ghost" disabled={busy} onClick={resend}>
            {purpose === "waitlist" ? "Send another invite" : "Send a new link"}
          </Button>
        </>
      ) : (
        <p className="text-muted">If {sent.email} has an account, we sent a link to choose a new password. It works once and expires in 24 hours.</p>
      )}
      <Button type="button" variant="ghost" onClick={() => { setSent(null); setResent(false); switchTo("signin"); }}>
        Back to sign in
      </Button>
    </div>
  ) : (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {mode === "signup" && <Field label="Your name" name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />}
      <Field label="Email" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
      {mode !== "forgot" && (
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          hint={mode === "signup" ? `At least ${MIN_PASSWORD_LENGTH} characters. A few words in a row works well.` : undefined}
        />
      )}
      {failure && <Banner kind="conflict" text={failure} />}
      <Button type="submit" disabled={busy}>
        {mode === "signup" ? joinLabel : mode === "forgot" ? "Email me a reset link" : "Sign in"}
      </Button>
      {mode === "signin" && (
        <>
          <Button type="button" variant="ghost" onClick={() => switchTo("forgot")}>
            Forgot password?
          </Button>
          <Button type="button" variant="ghost" onClick={() => switchTo("signup")}>
            {purpose === "waitlist" ? "New here? Join the waitlist" : "New here? Create an account"}
          </Button>
        </>
      )}
      {mode === "signup" && (
        <Button type="button" variant="ghost" onClick={() => switchTo("signin")}>
          I already have an account
        </Button>
      )}
      {mode === "forgot" && (
        <Button type="button" variant="ghost" onClick={() => switchTo("signin")}>
          Back to sign in
        </Button>
      )}
    </form>
  );

  return (
    <>
      {titled && (
        <>
          <h1 className="auth-title" data-silk-anchor>
            {headline}
          </h1>
          {lede && (
            <p className="auth-lede" data-silk-anchor>
              {lede}
            </p>
          )}
        </>
      )}
      <div className={titled ? "auth-card on-cream" : undefined} {...(titled ? { "data-silk-anchor": "" } : {})}>
        {fields}
      </div>
    </>
  );
}
