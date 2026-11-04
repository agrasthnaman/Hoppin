import { HomeCurrencyCard } from "../components/HomeCurrencyCard";
import { PageHeading } from "../components/PageHeading";
import { tripGate, useTripData } from "../app/trip-data";

/**
 * Who owes whom, once shared costs exist. Expenses are not stored yet, so this only shows the empty
 * settlement and the currency the phone uses to display amounts. Nothing here moves money.
 */
export default function Money() {
  const trip = useTripData();
  const gate = tripGate(trip);
  if (gate || !trip.snapshot) return gate;

  return (
    <div className="flex flex-col gap-4">
      <PageHeading title="Money" lede="Who owes whom, worked out on this phone. Hoppin doesn't send any money." />
      <section className="rounded-card border border-line bg-surface p-4">
        <h2 className="font-semibold">Who owes whom</h2>
        <p className="mt-1 text-sm text-muted">Nothing to settle yet.</p>
      </section>
      <HomeCurrencyCard />
    </div>
  );
}
