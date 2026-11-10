import { useNavigate } from "react-router";
import { forgetStoredPushToken } from "../lib/push-register";
import { clearAllLocalData } from "../offline/sync";
import { useServices } from "./services";

/** Signs out: removes this device's notification token, then every trip and document, then ends the session. */
export function useSignOut(): () => Promise<void> {
  const { db, auth, actions } = useServices();
  const navigate = useNavigate();
  return async () => {
    await forgetStoredPushToken(localStorage, (token) => actions.forgetPushToken(token)).catch(() => {});
    await clearAllLocalData(db);
    await auth.signOut();
    navigate("/sign-in", { replace: true });
  };
}
