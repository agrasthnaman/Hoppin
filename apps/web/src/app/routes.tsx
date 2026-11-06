import { Navigate, type RouteObject } from "react-router";
import { AccountScreen } from "../routes/AccountScreen";
import { DaysScreen } from "../routes/DaysScreen";
import { ItemScreen } from "../routes/ItemScreen";
import { JoinRoute } from "../routes/JoinRoute";
import { MembersScreen } from "../routes/MembersScreen";
import { MoreScreen } from "../routes/MoreScreen";
import { ConfirmEmail } from "../routes/ConfirmEmail";
import { ResetPassword } from "../routes/ResetPassword";
import { RequireSession } from "../routes/RequireSession";
import { SignIn } from "../routes/SignIn";
import { HomeGate, WelcomePage } from "../routes/HomeGate";
import { TripEntry } from "../routes/TripEntry";
import { TripShell } from "../routes/TripShell";
import { TripsHome } from "../routes/TripsHome";

// Screens that arrive in later issues are loaded on demand, so the first load stays small.
const lazyPage = (load: () => Promise<{ default: React.ComponentType }>) => ({
  lazy: async () => ({ Component: (await load()).default }),
});

export function createAppRoutes(): RouteObject[] {
  return [
    { path: "/", element: <HomeGate /> },
    { path: "/welcome", element: <WelcomePage /> },
    { path: "/sign-in", element: <SignIn /> },
    { path: "/auth/confirm", element: <ConfirmEmail /> },
    { path: "/reset-password", element: <ResetPassword /> },
    { path: "/join/:token", element: <JoinRoute /> },
    { path: "/gallery", lazy: async () => ({ Component: (await import("../Gallery")).Gallery }) }, // design-system preview
    {
      element: <RequireSession />,
      children: [
        { path: "/account", element: <AccountScreen /> },
        { path: "/trips", element: <TripsHome /> },
        {
          path: "/trips/:tripId",
          element: <TripShell />,
          children: [
            { index: true, element: <TripEntry /> },
            { path: "days", element: <DaysScreen /> },
            { path: "items/:itemId", element: <ItemScreen /> },
            { path: "more", element: <MoreScreen /> },
            { path: "members", element: <MembersScreen /> },
            { path: "today", element: <Navigate to="../days" replace /> }, // Today now lives at the top of today's page on Days; old links still work
            { path: "money", ...lazyPage(() => import("../routes/Money")) },
            { path: "docs", ...lazyPage(() => import("../routes/Docs")) },
            { path: "polls", ...lazyPage(() => import("../routes/Polls")) },
            { path: "map", ...lazyPage(() => import("../routes/TripMap")) },
            { path: "updates", ...lazyPage(() => import("../routes/Updates")) },
          ],
        },
      ],
    },
  ];
}
