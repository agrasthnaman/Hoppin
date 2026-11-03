import { formatSyncedAgo, syncBanners, type SyncState } from "@hoppin/core";
import { CalendarCheck, CalendarDays, FileText, Menu, Wallet, type LucideIcon } from "lucide-react";
import { NavLink, Outlet } from "react-router";
import { cn } from "../lib/cn";
import { Banner } from "./ui/Banner";

export interface AppShellProps {
  /** Path of the current trip, for example `/trips/abc`. */
  basePath: string;
  tripName: string;
  status: SyncState;
  /** Shown under the status banners, for example conflict notices. */
  above?: React.ReactNode;
}

const NAV: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "today", label: "Today", icon: CalendarCheck },
  { to: "days", label: "Days", icon: CalendarDays },
  { to: "money", label: "Money", icon: Wallet },
  { to: "docs", label: "Docs", icon: FileText },
  { to: "more", label: "More", icon: Menu },
];

/**
 * Frame around every trip screen: sync status and banners on top, the page in the middle, main navigation
 * as a bottom bar on phones and a sidebar on wide screens.
 */
export function AppShell({ basePath, tripName, status, above }: AppShellProps) {
  const banners = syncBanners(status);
  return (
    <div className="min-h-dvh bg-bg text-fg md:flex">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-fg"
      >
        Skip to content
      </a>

      <nav
        aria-label="Main"
        className={cn(
          "fixed inset-x-3 bottom-3 z-20 flex justify-around rounded-full bg-nav px-2 shadow-card",
          "md:static md:inset-auto md:min-h-dvh md:w-60 md:shrink-0 md:flex-col md:justify-start md:gap-1 md:rounded-none md:p-4 md:shadow-none",
        )}
      >
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={`${basePath}/${to}`}
            className={({ isActive }) =>
              cn(
                "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-2 text-xs font-semibold text-nav-fg transition-colors",
                "md:min-h-11 md:flex-none md:flex-row md:justify-start md:gap-3 md:px-4 md:text-sm",
                "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-nav-active",
                isActive && "text-nav-active",
              )
            }
          >
            <Icon aria-hidden="true" className="size-5" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-3xl">
        <header className="flex items-baseline justify-between gap-3 px-4 pb-2 pt-4 md:px-8">
          <p className="truncate font-display text-3xl font-extrabold">{tripName}</p>
          <p className="shrink-0 text-xs text-muted">{formatSyncedAgo(status.lastSyncedAt, status.now)}</p>
        </header>
        {banners.length > 0 && (
          <div className="flex flex-col gap-2 px-4 md:px-8">
            {banners.map((b) => (
              <Banner key={b.kind} kind={b.kind} text={b.text} />
            ))}
          </div>
        )}
        {above && <div className="flex flex-col gap-2 px-4 pt-2 md:px-8">{above}</div>}
        <main id="content" className="p-4 pb-28 md:p-8 md:pb-8">
          <Outlet />
        </main>
        </div>
      </div>
    </div>
  );
}
