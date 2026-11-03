import { Navigate, type RouteObject } from "react-router";
import { AccountScreen } from "../routes/AccountScreen";
import { DaysScreen } from "../routes/DaysScreen";
import { ItemScreen } from "../routes/ItemScreen";
import { JoinRoute } from "../routes/JoinRoute";
import { MembersScreen } from "../routes/MembersScreen";
import { MoreScreen } from "../routes/MoreScreen";
import { RequireSession } from "../routes/RequireSession";
import { SignIn } from "../routes/SignIn";
import { TripShell } from "../routes/TripShell";
import { TripsHome } from "../routes/TripsHome";

// Screens that arrive in later issues are loaded on demand, so the first load stays small.
const lazyPage = (load: () => Promise<{ default: React.ComponentType }>) => ({
  lazy: async () => ({ Component: (await load()).default }),
});

export function createAppRoutes(): RouteObject[] {
  return [
    { path: "/sign-in", element: <SignIn /> },
    { path: "/join/:token", element: <JoinRoute /> },
    { path: "/gallery", lazy: async () => ({ Component: (await import("../Gallery")).Gallery }) }, // design-system preview
    {
      element: <RequireSession />,
      children: [
        { path: "/", element: <TripsHome /> },
        { path: "/account", element: <AccountScreen /> },
        {
          path: "/trips/:tripId",
          element: <TripShell />,
          children: [
            { index: true, element: <Navigate to="days" replace /> },
            { path: "days", element: <DaysScreen /> },
            { path: "items/:itemId", element: <ItemScreen /> },
            { path: "more", element: <MoreScreen /> },
            { path: "members", element: <MembersScreen /> },
            { path: "today", ...lazyPage(() => import("../routes/Today")) },
            { path: "money", ...lazyPage(() => import("../routes/Money")) },
            { path: "docs", ...lazyPage(() => import("../routes/Docs")) },
          ],
        },
      ],
    },
  ];
}
