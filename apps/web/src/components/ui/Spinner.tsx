import { cn } from "../../lib/cn";

/** Hop, the jumping spider, drawn flat so a wait stays light. A silk thread holds him while he hops. */
function HopMark({ large }: { large?: boolean }) {
  return (
    <span aria-hidden="true" className={cn("hp-hop inline-flex text-accent", large ? "size-16" : "size-5")}>
      <svg viewBox="0 0 64 72" className="size-full overflow-visible">
        <path className="hp-silk" d="M32 1 V24" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <g className="hp-hop-body">
          <path d="M20 38 C12 32 8 26 6 20" stroke="#1c2430" strokeWidth="2" strokeLinecap="round" fill="none" />
          <path d="M44 38 C52 32 56 26 58 20" stroke="#1c2430" strokeWidth="2" strokeLinecap="round" fill="none" />
          <path d="M22 46 C14 52 12 60 14 66" stroke="#1c2430" strokeWidth="2" strokeLinecap="round" fill="none" />
          <path d="M42 46 C50 52 52 60 50 66" stroke="#1c2430" strokeWidth="2" strokeLinecap="round" fill="none" />
          <ellipse cx="32" cy="50" rx="13" ry="11" fill="#f4efe4" stroke="#1c2430" strokeWidth="1.6" />
          <circle cx="32" cy="48" r="3" fill="#ff6b4a" />
          <ellipse cx="32" cy="36" rx="10" ry="8" fill="#f4efe4" stroke="#1c2430" strokeWidth="1.6" />
          <circle cx="27.5" cy="35" r="2.3" fill="#12151c" />
          <circle cx="36.5" cy="35" r="2.3" fill="#12151c" />
          <circle cx="26.8" cy="34.2" r="0.7" fill="#fffaf2" />
          <circle cx="35.8" cy="34.2" r="0.7" fill="#fffaf2" />
        </g>
      </svg>
    </span>
  );
}

/** The small hop, for a button or a line that is still working. */
export function Spinner({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex", className)}>
      <HopMark />
    </span>
  );
}

/** A screen that is still opening: Hop in the middle, and a sentence for anyone who cannot see the hop. */
export function Loading({ label, className }: { label: string; className?: string }) {
  return (
    <div role="status" aria-label={label} className={cn("flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-sm text-muted", className)}>
      <HopMark large />
      <p>{label}</p>
    </div>
  );
}
