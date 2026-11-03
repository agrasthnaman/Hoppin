import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { registerSW } from "virtual:pwa-register";
import { createServices, ServicesProvider } from "./app/services";
import { createAppRoutes } from "./app/routes";
import { createSupabaseClient } from "./lib/supabase";
import "./styles/tokens.css";

registerSW({ immediate: true }); // installs the service worker (production builds only)

const root = createRoot(document.getElementById("root")!);

try {
  const services = createServices(createSupabaseClient(import.meta.env));
  const router = createBrowserRouter(createAppRoutes());
  root.render(
    <StrictMode>
      <ServicesProvider services={services}>
        <RouterProvider router={router} />
      </ServicesProvider>
    </StrictMode>,
  );
} catch (error) {
  // Misconfiguration (missing Supabase settings) is the one startup failure; say so plainly.
  root.render(
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-bold">Hoppin isn't set up yet</h1>
      <p className="mt-2">{error instanceof Error ? error.message : "Unknown error."}</p>
    </main>,
  );
}
