import { formatSyncedAgo, syncBanners, type SyncState } from "@hoppin/core";
import { Bell, CalendarDays, FileText, Map as MapIcon, MapPin, Menu, Wallet, type LucideIcon } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { NavLink, Outlet, useLocation } from "react-router";
import { cn } from "../lib/cn";
import { springSoft } from "../lib/motion";
import { Banner } from "./ui/Banner";

export interface AppShellProps {
  /** Path of the current trip, for example `/trips/abc`. */
  basePath: string;
  tripName: string;
  status: SyncState;
  /** Shown under the status banners, for example conflict notices. */
  above?: React.ReactNode;
  /** Marks More when the organizer has someone waiting to join. */
  memberWaiting?: boolean;
  /** Unread updates, shown on the bell opposite the trip name. */
  unreadUpdates?: number;
  /** The bell is open. */
  updatesOpen?: boolean;
  /** Opens the updates panel over the current page. */
  onOpenUpdates?: () => void;
}

const NAV: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "days", label: "Days", icon: CalendarDays },
  { to: "map", label: "Map", icon: MapIcon },
  { to: "money", label: "Money", icon: Wallet },
  { to: "docs", label: "Docs", icon: FileText },
  { to: "more", label: "More", icon: Menu },
];

/**
 * Frame around every trip screen: sync status and banners on top, the page in the middle, main navigation
 * as a bottom bar on phones and a sidebar on wide screens.
 */
export function AppShell({ basePath, tripName, status, above, memberWaiting = false, unreadUpdates = 0, updatesOpen = false, onOpenUpdates }: AppShellProps) {
  const banners = syncBanners(status);
  const location = useLocation();
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
          "md:sticky md:inset-auto md:top-0 md:z-30 md:h-dvh md:w-60 md:shrink-0 md:flex-col md:justify-start md:gap-1 md:self-start md:overflow-y-auto md:rounded-none md:p-4 md:pt-6 md:shadow-none",
      )}
    >
      <p className="hp-mark mb-10 hidden px-4 md:flex">
        <MapPin aria-hidden="true" size={22} strokeWidth={1.7} />
        hoppin
      </p>
      {NAV.map(({ to, label, icon: Icon }) => {
          const waiting = memberWaiting && to === "more";
          return (
          <NavLink
            key={to}
            to={`${basePath}/${to}`}
            aria-describedby={waiting ? "more-waiting" : undefined}
            className={({ isActive }) =>
              cn(
                "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-2 text-xs font-semibold text-nav-fg transition-colors",
                "md:min-h-11 md:flex-none md:flex-row md:justify-start md:gap-3 md:rounded-2xl md:px-4 md:text-sm",
                to === "more" && "md:mt-auto",
                "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-nav-active",
                isActive && "text-nav-active md:bg-nav-active md:text-nav",
              )
            }
          >
            <span className="relative">
              <Icon aria-hidden="true" className="size-5" />
              {waiting && <span data-waiting="" aria-hidden="true" className="absolute -right-1 -top-1 size-2.5 rounded-full bg-accent ring-2 ring-nav" />}
            </span>
            {label}
          </NavLink>
          );
        })}
      {memberWaiting && <span id="more-waiting" className="sr-only">Someone is waiting for approval</span>}
      </nav>

      <div className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-3xl">
        <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-4 md:px-8">
          <p className="page-title min-w-0 truncate text-4xl">{tripName}</p>
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <button
              type="button"
              aria-label="Updates"
              aria-expanded={updatesOpen}
              aria-describedby={unreadUpdates > 0 ? "updates-new" : undefined}
              onClick={onOpenUpdates}
              className="inline-flex size-11 items-center justify-center rounded-full text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span className="relative">
                <Bell aria-hidden="true" className="size-5" />
                {unreadUpdates > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 size-2.5 rounded-full bg-accent" />}
              </span>
            </button>
            {unreadUpdates > 0 && <span id="updates-new" className="sr-only">You have new updates</span>}
            <p className="text-right text-xs leading-none text-muted">{formatSyncedAgo(status.lastSyncedAt, status.now)}</p>
          </div>
        </header>
        <div className="flex flex-col px-4 md:px-8">
          <AnimatePresence initial={false}>
            {banners.map((b) => (
              <m.div
                key={b.kind}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <Banner kind={b.kind} text={b.text} className="mb-2" />
              </m.div>
            ))}
          </AnimatePresence>
        </div>
        {above && <div className="flex flex-col gap-2 px-4 pt-2 md:px-8">{above}</div>}
        <main id="content" className="p-4 pb-28 md:p-8 md:pb-8">
          <m.div key={location.pathname} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={springSoft}>
            <Outlet />
          </m.div>
        </main>
        </div>
      </div>
    </div>
  );
}
