import { MIN_PASSWORD_LENGTH, validatePassword } from "@hoppin/core";
import { useId, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { useServices } from "../app/services";
import { useSession } from "../app/session";
import { Banner } from "../components/ui/Banner";
import { Button } from "../components/ui/Button";
import { Spinner } from "../components/ui/Spinner";
import { AuthError } from "../lib/auth-api";
import { inputClass } from "../lib/forms";
import { AuthStage } from "./AuthStage";
import { HomeLink } from "./HomeLink";

/**
 * Choose a new password. The emailed reset link signs the person in and brings them here; the same page is used from
 * the account screen to change a password. Without a session the link was already used or has expired.
 */
export function ResetPassword() {
  const { auth, sessionClient } = useServices();
  const session = useSession(sessionClient);
  const id = useId();
  // An invite from the sign-up queue lands here with ?welcome=1, to create the very first password.
  const welcome = useSearchParams()[0].get("welcome") === "1";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  // A session older than a day must prove it is still the account's owner: a one-time code is emailed to them.
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const codeId = useId();

  async function sendCode() {
    await auth.requestCode();
    setCodeSent(true);
    setCode("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const check = validatePassword(password);
    setError(check.ok ? null : check.reason);
    setFailure(null);
    if (!check.ok) return;
    if (codeSent && !code.trim()) return setFailure("Enter the code from the email we just sent you.");
    setBusy(true);
    try {
      await auth.updatePassword(password, codeSent ? code.trim() : undefined);
      setDone(true);
    } catch (e) {
      const why = e instanceof AuthError ? e.code : "other";
      if (why === "reauthentication-needed") await sendCode().catch(() => setFailure("We couldn't send the code just now. Please try again in a few minutes."));
      else if (why === "invalid-code") setFailure("That code didn't work. Use the code from the latest email, or send a new one.");
      else setFailure(why === "weak-password" ? (e as Error).message : "We couldn't save your password just now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    setFailure(null);
    setBusy(true);
    try {
      await sendCode();
    } catch {
      setFailure("We couldn't send the code just now. Please try again in a few minutes.");
    } finally {
      setBusy(false);
    }
  }

  let body: React.ReactNode;
  if (session.status === "loading") {
    body = (
      <p role="status" className="flex items-center gap-3">
        <Spinner className="text-accent" />
        Loading
      </p>
    );
  }
  else if (session.status === "signedOut")
    body = (
      <div className="flex flex-col items-start gap-3">
        <p className="text-lg font-semibold">
          {welcome ? "This invite has already been used, or it is more than 24 hours old." : "This link has already been used, or it is more than 24 hours old."}
        </p>
        <p className="text-muted">
          {welcome
            ? 'If you already created your password, just sign in. If not, choose "Forgot password" on the sign-in page and we\'ll send a fresh link.'
            : 'No problem. Go to the sign-in page and choose "Forgot password" to get a fresh link.'}
        </p>
        <Link to="/sign-in" className="font-semibold text-link focus-visible:outline-2 focus-visible:outline-accent">
          Go to sign in
        </Link>
      </div>
    );
  else if (done)
    body = (
      <div className="flex flex-col items-start gap-3">
        <p role="status" className="text-lg font-semibold">{welcome ? "You're all set" : "Password updated"}</p>
        <HomeLink className="font-semibold text-link focus-visible:outline-2 focus-visible:outline-accent">Continue</HomeLink>
      </div>
    );
  else
    body = (
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor={id} className="text-sm font-medium">
            {welcome ? "Your password" : "New password"}
          </label>
          <input
            id={id}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-help`}
            className={inputClass}
          />
          <span id={`${id}-help`} className={error ? "text-sm text-danger-fg" : "text-sm text-muted"}>
            {error ?? `At least ${MIN_PASSWORD_LENGTH} characters. A few words in a row works well.`}
          </span>
        </div>
        {codeSent && (
          <div className="flex flex-col gap-1">
            <label htmlFor={codeId} className="text-sm font-medium">
              Code from your email
            </label>
            <input
              id={codeId}
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              aria-describedby={`${codeId}-help`}
              className={inputClass}
            />
            <span id={`${codeId}-help`} className="text-sm text-muted">
              To keep your account safe, we emailed you a code. Enter it to confirm it's you.
            </span>
          </div>
        )}
        {failure && <Banner kind="conflict" text={failure} />}
        <Button type="submit" busy={busy}>
          {welcome ? "Create password" : "Save password"}
        </Button>
        {codeSent && (
          <Button type="button" variant="ghost" disabled={busy} onClick={resendCode}>
            Send a new code
          </Button>
        )}
      </form>
    );

  return (
    <AuthStage>
      <h1 className="auth-title" data-silk-anchor>
        {welcome ? "Create your password" : "Choose a new password"}
      </h1>
      <p className="auth-lede">{welcome ? "Welcome to Hoppin. One password, and you're in." : "One new password, then you're back on the trip."}</p>
      <div className="auth-card on-cream" data-silk-anchor>
        {body}
      </div>
    </AuthStage>
  );
}
