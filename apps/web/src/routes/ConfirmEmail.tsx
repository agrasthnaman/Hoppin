import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { useServices } from "../app/services";
import { useSession } from "../app/session";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Spinner } from "../components/ui/Spinner";
import type { EmailLinkType } from "../lib/auth-api";

const TYPES: readonly EmailLinkType[] = ["signup", "recovery", "invite"];

/** Keep only the path of where the link was headed, so it can never lead off this site. */
function pathOnly(next: string | null): string {
  if (!next) return "/";
  try {
    const url = new URL(next, window.location.origin);
    const path = `${url.pathname}${url.search}${url.hash}`;
    return path.startsWith("//") ? "/" : path;
  } catch {
    return "/";
  }
}

/**
 * Where the links in our emails land (on our own address). The token is confirmed here, in the page, which signs the
 * person in; then they go on to where they were headed, or to choose a password after a reset. Someone already signed
 * in is asked first: the link may belong to another account (anyone can send theirs), and confirming it switches to it.
 */
export function ConfirmEmail() {
  const { auth, sessionClient } = useServices();
  const session = useSession(sessionClient);
  const [params] = useSearchParams();
  const tokenHash = params.get("token_hash");
  const type = TYPES.find((t) => t === params.get("type"));
  const [state, setState] = useState<"working" | "ask" | "done" | "invalid">(tokenHash && type ? "working" : "invalid");
  const started = useRef(false);

  function confirm() {
    if (!tokenHash || !type || started.current) return; // once, even in React strict mode (the token works once)
    started.current = true;
    setState("working");
    auth.verifyEmailLink({ tokenHash, type }).then(
      () => setState("done"),
      () => setState("invalid"),
    );
  }

  useEffect(() => {
    if (!tokenHash || !type || started.current || session.status === "loading") return;
    if (session.status === "signedIn") setState("ask");
    else confirm();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- decided once, when the session is known
  }, [session.status, tokenHash, type]);

  // A reset link goes to choose a new password. An invite (from the sign-up queue) goes to create the first password.
  const destination = type === "recovery" ? "/reset-password" : type === "invite" ? "/reset-password?welcome=1" : pathOnly(params.get("next"));
  if (state === "done") return <Navigate to={destination} replace />;
  // A link opened a second time (the first time already signed them in) is not a problem: they are in, so carry on.
  if (state === "invalid" && session.status === "signedIn") return <Navigate to={destination} replace />;
  const waiting = state === "working" || (state === "invalid" && session.status === "loading");

  if (state === "ask" && session.status === "signedIn")
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4">
        <h1 className="font-display text-4xl font-extrabold">You're already signed in</h1>
        <Card>
          <div className="flex flex-col items-start gap-3">
            <p>
              You're signed in{session.email ? ` as ${session.email}` : ""}. This link may be for a different account, and opening it signs you in to
              the account it belongs to.
            </p>
            <Button onClick={confirm}>Continue with this link</Button>
            <Link to="/" className="font-semibold text-link focus-visible:outline-2 focus-visible:outline-accent">
              Stay signed in
            </Link>
          </div>
        </Card>
      </main>
    );

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4">
      <h1 className="font-display text-4xl font-extrabold">{waiting ? "Confirming…" : "One more step"}</h1>
      <Card>
        {waiting ? (
          <p role="status" aria-label="One moment while we confirm your link." className="flex items-center gap-3">
            <Spinner className="text-accent" />
            One moment while we confirm your link.
          </p>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <p className="text-lg font-semibold">This link has already been used, or it is more than 24 hours old.</p>
            <p className="text-muted">
              If you already confirmed your email, just sign in with your password. If not, sign in with your email and
              password and we'll send you a fresh link.
            </p>
            <Link to="/sign-in" className="inline-flex min-h-12 items-center rounded-full bg-accent px-6 font-semibold text-accent-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              Sign in
            </Link>
          </div>
        )}
      </Card>
    </main>
  );
}
