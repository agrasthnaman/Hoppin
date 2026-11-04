import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { useServices } from "../app/services";
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
  const { auth } = useServices();
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

  if (state === "done") return <Navigate to={type === "recovery" ? "/reset-password" : pathOnly(params.get("next"))} replace />;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4">
      <h1 className="font-display text-4xl font-extrabold">{state === "working" ? "Confirming…" : "Link problem"}</h1>
      <Card>
        {state === "working" ? (
          <p role="status">One moment while we confirm your link.</p>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <p className="text-lg font-semibold">This link has expired or was already used</p>
            <p className="text-muted">Email links work once and expire after 24 hours. Sign in, or ask for a new link.</p>
            <Link to="/sign-in" className="font-semibold text-link focus-visible:outline-2 focus-visible:outline-accent">
              Go to sign in
            </Link>
          </div>
        )}
      </Card>
    </main>
  );
}
