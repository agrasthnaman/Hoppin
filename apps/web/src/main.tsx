import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { registerSW } from "virtual:pwa-register";
import { createServices, ServicesProvider, type Services } from "./app/services";
import { DemoBadge } from "./components/DemoBadge";
import { createAppRoutes } from "./app/routes";
import { createSupabaseClient } from "./lib/supabase";
import { ThemeProvider } from "./theme/ThemeProvider";
import "./styles/tokens.css";

registerSW({ immediate: true }); // installs the service worker (production builds only)

const root = createRoot(document.getElementById("root")!);

// `npm run demo` runs the whole app on sample data with no accounts or network (see src/demo).
const demo = import.meta.env.VITE_DEMO === "true";

async function start() {
  const services: Services = demo
    ? (await import("./demo/demo-services")).createDemoServices()
    : createServices(createSupabaseClient(import.meta.env));
  const router = createBrowserRouter(createAppRoutes());
  root.render(
    <StrictMode>
      <ThemeProvider>
        <ServicesProvider services={services}>
          {demo && <DemoBadge />}
          <RouterProvider router={router} />
        </ServicesProvider>
      </ThemeProvider>
    </StrictMode>,
  );
}

start().catch((error: unknown) => {
  // Misconfiguration (missing Supabase settings) is the one startup failure; say so plainly.
  root.render(
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-bold">Hoppin isn't set up yet</h1>
      <p className="mt-2">{error instanceof Error ? error.message : "Unknown error."}</p>
    </main>,
  );
});
