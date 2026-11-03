import { cn } from "../../lib/cn";

export interface ChipProps {
  initial: string;
  title: string;
  color: string;
  onOpen: () => void;
  className?: string;
}

/** Small avatar chip for a member's shared optional plan. Tap to open its details. */
export function Chip({ initial, title, color, onOpen, className }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${initial}: ${title}`}
      className={cn(
        "inline-flex min-h-8 max-w-44 items-center gap-1.5 rounded-full border border-line bg-surface py-0.5 pl-0.5 pr-3 text-xs text-fg",
        "hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
        style={{ backgroundColor: color }}
      >
        {initial}
      </span>
      <span className="truncate">{title}</span>
    </button>
  );
}
