import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Keyboard, KeyboardResize } from "@capacitor/keyboard";
import { StatusBar, Style } from "@capacitor/status-bar";
import { toAppPath } from "./app-link";

/** Status bar follows the saved theme, and the keyboard resizes the page instead of covering the field. */
export async function bootNativeShell(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const dark = document.documentElement.getAttribute("data-theme") === "dark";
  await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
  if (Capacitor.getPlatform() === "android") {
    await StatusBar.setBackgroundColor({ color: dark ? "#12162c" : "#ffffff" });
  }
  await Keyboard.setResizeMode({ mode: KeyboardResize.Body });
}

/** Confirm, reset and invite links open the matching screen. Other hosts are ignored. */
export function listenForAppLinks(navigate: (path: string) => void): void {
  if (!Capacitor.isNativePlatform()) return;
  const open = (url: string) => {
    const path = toAppPath(url);
    if (path) navigate(path);
  };
  void App.getLaunchUrl().then((launch) => {
    if (launch?.url) open(launch.url);
  });
  void App.addListener("appUrlOpen", (event) => open(event.url));
}
