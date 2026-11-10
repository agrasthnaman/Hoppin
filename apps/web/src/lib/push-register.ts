import { pathFromPush } from "./push-open";

export const PUSH_ASKED_KEY = "hoppin.push-asked";
export const PUSH_TOKEN_KEY = "hoppin.push-token";

/** Ask once, on the phone, and never on the website or on first launch before a trip exists. */
export function shouldOfferPush(native: boolean, asked: boolean): boolean {
  return native && !asked;
}

export interface RegisterPushDeps {
  platform: "ios" | "android";
  requestPermission(): Promise<boolean>;
  register(): Promise<void>;
  nextToken(): Promise<string>;
  save(token: string, platform: "ios" | "android"): Promise<void>;
}

/** Asks, then stores the device token. A refusal registers nothing. */
export async function registerPushToken(deps: RegisterPushDeps): Promise<string | null> {
  if (!(await deps.requestPermission())) return null;
  const pending = deps.nextToken();
  await deps.register();
  const token = await pending;
  await deps.save(token, deps.platform);
  return token;
}

/** Removes this device's token from the account, then forgets it here. No token means nothing to do. */
export async function forgetStoredPushToken(
  storage: { getItem(key: string): string | null; removeItem(key: string): void },
  remove: (token: string) => Promise<void>,
): Promise<void> {
  const token = storage.getItem(PUSH_TOKEN_KEY);
  if (!token) return;
  await remove(token);
  storage.removeItem(PUSH_TOKEN_KEY);
}

/** The real phone registration. Plugins load only when this runs, so the website never asks. */
export async function turnOnPush(
  save: (token: string, platform: "ios" | "android") => Promise<void>,
  storage: Pick<Storage, "setItem"> = localStorage,
): Promise<string | null> {
  const { Capacitor } = await import("@capacitor/core");
  const platform = Capacitor.getPlatform();
  if (platform !== "ios" && platform !== "android") return null;
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const token = await registerPushToken({
    platform,
    requestPermission: async () => (await PushNotifications.requestPermissions()).receive === "granted",
    register: () => PushNotifications.register(),
    nextToken: () =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("no token")), 20_000);
        void PushNotifications.addListener("registration", (event) => {
          clearTimeout(timer);
          resolve(event.value);
        });
        void PushNotifications.addListener("registrationError", () => {
          clearTimeout(timer);
          reject(new Error("registration failed"));
        });
      }),
    save,
  });
  if (token) storage.setItem(PUSH_TOKEN_KEY, token);
  return token;
}

/** A tapped notification opens the trip it names. Other links are ignored. */
export function listenForPushOpens(navigate: (path: string) => void): void {
  void (async () => {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;
    const { PushNotifications } = await import("@capacitor/push-notifications");
    await PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
      const path = pathFromPush(event.notification.data);
      if (path) navigate(path);
    });
  })();
}
