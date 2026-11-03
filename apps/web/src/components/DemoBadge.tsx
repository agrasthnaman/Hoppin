/** Small reminder, shown only in demo mode, that the data is sample data and nothing is saved. */
export function DemoBadge() {
  return (
    <div className="pointer-events-none fixed bottom-[4.5rem] right-2 z-50 md:bottom-3 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-fg shadow-card">
      Demo mode · sample data, nothing is saved
    </div>
  );
}
