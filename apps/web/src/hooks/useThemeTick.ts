import { useEffect, useState } from "react";

/** A number that changes when the palette or the light/dark mode changes, so a screen can redraw anything it coloured from the theme. */
export function useThemeTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(() => setTick((value) => value + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-palette", "data-theme"] });
    return () => observer.disconnect();
  }, []);
  return tick;
}
