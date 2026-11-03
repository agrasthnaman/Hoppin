import { createContext, useContext } from "react";

export interface User {
  userId: string;
  email: string | null;
}

export const UserContext = createContext<User | null>(null);

/** The signed-in person (only available below the sign-in gate). */
export function useUser(): User {
  const user = useContext(UserContext);
  if (!user) throw new Error("useUser must be used below RequireSession");
  return user;
}
