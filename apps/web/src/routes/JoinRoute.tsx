import { useNavigate, useParams } from "react-router";
import { useServices } from "../app/services";
import { useSession } from "../app/session";
import { Loading } from "../components/ui/Spinner";
import { JoinFlow } from "./JoinFlow";

/** The page an invite link opens. Works signed out (sign up by email) and signed in (request to join). */
export function JoinRoute() {
  const { token = "" } = useParams();
  const { sessionClient, auth, invites } = useServices();
  const session = useSession(sessionClient);
  const navigate = useNavigate();
  if (session.status === "loading") return <Loading label="Loading" />;
  return (
    <JoinFlow
      token={token}
      signedInUserId={session.status === "signedIn" ? session.userId : null}
      redirectTo={window.location.href}
      resetRedirectTo={`${window.location.origin}/reset-password`}
      auth={auth}
      redeem={invites.redeemInvite}
      onContinue={(tripId) => navigate(`/trips/${tripId}/days`)}
    />
  );
}
