import { Navigate, useSearchParams } from "react-router";
import { useServices } from "../app/services";
import { useSession } from "../app/session";
import { AuthForm } from "../components/AuthForm";
import { Spinner } from "../components/ui/Spinner";
import { AuthStage } from "./AuthStage";

/** Only follow `next` if it is an address inside this app. */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

/** Sign in with email and password, or join the waitlist. People with an invite use the join page instead. */
export function SignIn() {
  const { auth, sessionClient } = useServices();
  const session = useSession(sessionClient);
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));

  if (session.status === "signedIn") return <Navigate to={next} replace />;

  return (
    <AuthStage>
      {session.status === "loading" ? (
        <p role="status" className="auth-lede flex items-center gap-3">
          <Spinner />
          Loading
        </p>
      ) : (
        <AuthForm api={auth} purpose="waitlist" titled confirmRedirectTo={`${window.location.origin}${next}`} resetRedirectTo={`${window.location.origin}/reset-password`} />
      )}
    </AuthStage>
  );
}
