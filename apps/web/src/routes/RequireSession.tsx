import { Navigate, Outlet, useLocation } from "react-router";
import { useServices } from "../app/services";
import { useSession } from "../app/session";
import { UserContext } from "../app/user";
import { Loading } from "../components/ui/Spinner";

/** Everything below this needs a signed-in person; others are sent to sign in and brought back afterwards. */
export function RequireSession() {
  const { sessionClient } = useServices();
  const session = useSession(sessionClient);
  const location = useLocation();
  if (session.status === "loading") return <Loading label="Loading" />;
  if (session.status === "signedOut") {
    return <Navigate to={`/sign-in?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  return (
    <UserContext.Provider value={{ userId: session.userId, email: session.email }}>
      <Outlet />
    </UserContext.Provider>
  );
}
