import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import { registerSW } from "virtual:pwa-register";
import { Gallery } from "./Gallery";
import { TripShell } from "./routes/TripShell";
import "./styles/tokens.css";

// Each screen is loaded on demand, so the first load stays small.
const page = (load: () => Promise<{ default: React.ComponentType }>) => ({
  lazy: async () => ({ Component: (await load()).default }),
});

const router = createBrowserRouter([
  { path: "/", element: <Gallery /> }, // design-system preview, replaced by the trips list (issue #9)
  {
    path: "/trips/:tripId",
    element: <TripShell />,
    children: [
      { index: true, element: <Navigate to="today" replace /> },
      { path: "today", ...page(() => import("./routes/Today")) },
      { path: "days", ...page(() => import("./routes/Days")) },
      { path: "money", ...page(() => import("./routes/Money")) },
      { path: "docs", ...page(() => import("./routes/Docs")) },
      { path: "more", ...page(() => import("./routes/More")) },
    ],
  },
]);

registerSW({ immediate: true }); // installs the service worker (production builds only)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
