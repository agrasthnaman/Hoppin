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

function explain(error: unknown, mode: Mode): string {
  const code = error instanceof AuthError ? error.code : "other";
  if (code === "invalid-credentials") return "Wrong email or password.";
  if (code === "rate-limited") return "Too many emails right now. Please try again in a little while.";
  if (code === "weak-password" && error instanceof Error) return error.message;
  if (mode === "signup") return "Couldn't create the account. Please try again.";
  if (mode === "forgot") return "Couldn't send the link. Please try again.";
  return "Couldn't sign in. Please try again.";
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
}: {
  api: AuthFormApi;
  /** Where the confirmation link brings the person back to. */
  confirmRedirectTo: string;
  /** Where the reset link brings the person to (the reset-password page). */
  resetRedirectTo: string;
  initialMode?: Mode;
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
      else setFailure(explain(error, mode));
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
      setFailure(explain(error, "signup"));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-lg font-semibold">Check your email</p>
        {sent.kind === "confirm" ? (
          <>
            <p className="text-muted">
              We sent a confirmation link to {sent.email}. It works once and expires in 24 hours. After you open it, sign in with your password.
            </p>
            {resent && <p role="status">A new link is on its way. The old one no longer works.</p>}
            {failure && <Banner kind="conflict" text={failure} />}
            <Button type="button" variant="ghost" disabled={busy} onClick={resend}>
              Send a new link
            </Button>
          </>
        ) : (
          <p className="text-muted">If {sent.email} has an account, we sent a link to choose a new password. It works once and expires in 24 hours.</p>
        )}
        <Button type="button" variant="ghost" onClick={() => { setSent(null); setResent(false); switchTo("signin"); }}>
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
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
        {mode === "signup" ? "Create account" : mode === "forgot" ? "Email me a reset link" : "Sign in"}
      </Button>
      {mode === "signin" && (
        <>
          <Button type="button" variant="ghost" onClick={() => switchTo("forgot")}>
            Forgot password?
          </Button>
          <Button type="button" variant="ghost" onClick={() => switchTo("signup")}>
            New here? Create an account
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
}
