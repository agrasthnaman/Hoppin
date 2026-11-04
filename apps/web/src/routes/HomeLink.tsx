import { localDate } from "@hoppin/core";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { homePath } from "../app/home-path";
import { useServices } from "../app/services";

/** A link to Today when a trip is underway, and to the trip list otherwise. */
export function HomeLink({ className, children }: { className?: string; children: React.ReactNode }) {
  const { actions, clock } = useServices();
  const [to, setTo] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const today = localDate(clock.now(), clock.timeZone);
    actions.listTrips().then(
      (trips) => alive && setTo(homePath(trips, today)),
      () => alive && setTo("/trips"),
    );
    return () => {
      alive = false;
    };
  }, [actions, clock]);

  if (!to) return <span className={className}>{children}</span>;
  return (
    <Link to={to} className={className}>
      {children}
    </Link>
  );
}
