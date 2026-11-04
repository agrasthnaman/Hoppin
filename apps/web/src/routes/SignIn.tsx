import { Navigate, useSearchParams } from "react-router";
import { useServices } from "../app/services";
import { useSession } from "../app/session";
import { AuthForm } from "../components/AuthForm";
import { Card } from "../components/ui/Card";

/** Only follow `next` if it is an address inside this app. */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

/** Sign in with email and password. New people can create an account here, or join through an organizer's invite link. */
export function SignIn() {
  const { auth, sessionClient } = useServices();
  const session = useSession(sessionClient);
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));

  if (session.status === "loading") return <p role="status" className="p-4">Loading…</p>;
  if (session.status === "signedIn") return <Navigate to={next} replace />;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4">
      <h1 className="font-display text-4xl font-extrabold">Sign in</h1>
      <Card>
        <AuthForm api={auth} confirmRedirectTo={`${window.location.origin}${next}`} resetRedirectTo={`${window.location.origin}/reset-password`} />
      </Card>
    </main>
  );
}
