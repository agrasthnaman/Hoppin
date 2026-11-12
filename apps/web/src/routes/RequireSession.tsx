import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { useServices } from "../app/services";
import { useSession } from "../app/session";
import { UserContext } from "../app/user";
import { Loading } from "../components/ui/Spinner";
import { claimLocalData } from "../offline/sync";

/**
 * Everything below this needs a signed-in person; others are sent to sign in and brought back afterwards. Nothing
 * below renders until this device's offline data belongs to that person.
 */
export function RequireSession() {
  const { sessionClient, db } = useServices();
  const session = useSession(sessionClient);
  const location = useLocation();
  const userId = session.status === "signedIn" ? session.userId : null;
  const [claimed, setClaimed] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void claimLocalData(db, userId).then(() => alive && setClaimed(userId));
    return () => {
      alive = false;
    };
  }, [db, userId]);

  if (session.status === "loading") return <Loading label="Loading" />;
  if (session.status === "signedOut") {
    return <Navigate to={`/sign-in?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  if (claimed !== session.userId) return <Loading label="Loading" />;
  return (
    <UserContext.Provider value={{ userId: session.userId, email: session.email }}>
      <Outlet />
    </UserContext.Provider>
  );
}
