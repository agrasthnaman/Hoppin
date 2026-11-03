import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// Runs the app's real data code against the dev Supabase project: `npm run test:dev -w apps/web`.
// Needs apps/web/.env.local, and a dev project where signing up returns a session straight away
// (Authentication > Providers > Email > "Confirm email" off). See docs/deploy.md.
export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["integration/**/*.test.ts"],
    env: loadEnv("development", process.cwd(), "VITE_"),
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
