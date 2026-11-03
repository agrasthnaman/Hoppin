import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Service worker: the app itself (pages, scripts, styles, icons) is stored on the device on first load,
    // so it opens with no signal. Trip data and documents are kept separately by the offline cache.
    VitePWA({
      disable: Boolean(process.env.VITEST),
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Hoppin",
        short_name: "Hoppin",
        description: "One shared place for your group trip, even with no signal.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        theme_color: "#0f766e",
        background_color: "#fbf8f3",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest,woff2}"],
        // Only the Latin fonts are stored for offline use; other alphabets fall back to the phone's own font.
        globIgnores: ["**/*cyrillic*", "**/*greek*", "**/*vietnamese*", "**/*italic*"],
        navigateFallback: "/index.html", // any address inside the app loads the app, also offline
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    css: false,
    exclude: [...configDefaults.exclude, "integration/**"], // real-project tests only run on purpose: npm run test:dev
  },
});
