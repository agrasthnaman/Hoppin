import { useEffect, useState } from "react";

const QUERY = "(min-width: 768px)";

/** True on wide screens (where sheets are centred dialogs instead of bottom sheets). */
export function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(() => typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(QUERY);
    const onChange = () => setDesktop(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return desktop;
}
