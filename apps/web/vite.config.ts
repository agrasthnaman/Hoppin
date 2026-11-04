import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  // These are loaded the moment a booking PDF is chosen. Bundling them up front keeps that first choice from restarting the page.
  optimizeDeps: { include: ["pdfjs-dist", "tesseract.js"] },
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
        theme_color: "#0d22ee",
        background_color: "#ffffff",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest,woff2}"],
        // Only the Latin fonts are stored for offline use; other alphabets fall back to the phone's own font.
        globIgnores: ["**/*cyrillic*", "**/*greek*", "**/*vietnamese*", "**/*italic*", "**/Landing-*", "**/Gallery-*", "**/silk-spider-cursor-*", "**/pdf-*", "**/pdf.worker*", "**/worker.min-*"], // the landing page and the design preview are big and not needed offline
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
