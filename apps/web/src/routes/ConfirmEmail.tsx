import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { useServices } from "../app/services";
import { useSession } from "../app/session";
import { Card } from "../components/ui/Card";
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
 * person in; then they go on to where they were headed, or to choose a password after a reset.
 */
export function ConfirmEmail() {
  const { auth, sessionClient } = useServices();
  const session = useSession(sessionClient);
  const [params] = useSearchParams();
  const tokenHash = params.get("token_hash");
  const type = TYPES.find((t) => t === params.get("type"));
  const [state, setState] = useState<"working" | "done" | "invalid">(tokenHash && type ? "working" : "invalid");
  const started = useRef(false);

  useEffect(() => {
    if (!tokenHash || !type || started.current) return; // once, even in React strict mode (the token works once)
    started.current = true;
    auth.verifyEmailLink({ tokenHash, type }).then(
      () => setState("done"),
      () => setState("invalid"),
    );
  }, [auth, tokenHash, type]);

  const destination = type === "recovery" ? "/reset-password" : pathOnly(params.get("next"));
  if (state === "done") return <Navigate to={destination} replace />;
  // A link opened a second time (the first time already signed them in) is not a problem: they are in, so carry on.
  if (state === "invalid" && session.status === "signedIn") return <Navigate to={destination} replace />;
  const waiting = state === "working" || (state === "invalid" && session.status === "loading");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4">
      <h1 className="font-display text-4xl font-extrabold">{waiting ? "Confirming…" : "One more step"}</h1>
      <Card>
        {waiting ? (
          <p role="status">One moment while we confirm your link.</p>
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
