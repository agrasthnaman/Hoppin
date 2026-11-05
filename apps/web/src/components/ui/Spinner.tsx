import { cn } from "../../lib/cn";

/** Three bouncing dots in the surrounding text colour, so it matches a button or a page. */
export function Spinner({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("inline-flex items-center gap-1", className)}>
      <span className="hp-dot size-1.5 rounded-full bg-current" />
      <span className="hp-dot size-1.5 rounded-full bg-current [animation-delay:150ms]" />
      <span className="hp-dot size-1.5 rounded-full bg-current [animation-delay:300ms]" />
    </span>
  );
}

/** A short wait with the dots and a sentence, for screens that are still opening. */
export function Loading({ label, className }: { label: string; className?: string }) {
  return (
    <p role="status" className={cn("flex items-center gap-3 p-4 text-sm text-muted", className)}>
      <Spinner className="text-accent" />
      {label}
    </p>
  );
}
