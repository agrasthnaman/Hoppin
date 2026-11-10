import type { CapacitorConfig } from "@capacitor/cli";

// Live reload is opt-in for a local simulator (`CAP_SERVER_URL=http://localhost:5173`). Never commit it turned on:
// a production build must use the files in `dist`, not the website.
const liveReload = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: "club.hoppinclub.app",
  appName: "Hoppin",
  webDir: "dist",
  backgroundColor: "#ffffff",
  ios: { contentInset: "always" },
  ...(liveReload ? { server: { url: liveReload, cleartext: liveReload.startsWith("http://") } } : {}),
};

export default config;
