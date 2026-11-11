import { useLocation } from "react-router";
import { cn } from "../lib/cn";

/** Small reminder, shown only in demo mode, that the data is sample data and nothing is saved. */
export function DemoBadge() {
  const { pathname } = useLocation();
  const inApp = pathname.startsWith("/trips") || pathname.startsWith("/account");
  return (
    <div
      className={cn(
        "pointer-events-none fixed z-50 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-fg shadow-card",
        inApp ? "bottom-[4.5rem] right-2 md:bottom-3" : "bottom-2 left-1/2 max-w-[calc(100%-1.5rem)] -translate-x-1/2 text-center",
      )}
    >
      Demo mode · sample data, nothing is saved
    </div>
  );
}
