import { useNavigate } from "react-router";
import { clearAllLocalData } from "../offline/sync";
import { useServices } from "./services";

/** Signs out: removes every trip and document from this device first, then ends the session. */
export function useSignOut(): () => Promise<void> {
  const { db, auth } = useServices();
  const navigate = useNavigate();
  return async () => {
    await clearAllLocalData(db);
    await auth.signOut();
    navigate("/sign-in", { replace: true });
  };
}
