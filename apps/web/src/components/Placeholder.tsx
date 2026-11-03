/** Stand-in for a screen that a later issue builds. */
export function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="text-muted">This screen is coming soon.</p>
    </div>
  );
}
