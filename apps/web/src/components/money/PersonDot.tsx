import type { MoneyPerson } from "../../app/people";
import { cn } from "../../lib/cn";
import { PERSON_COLORS } from "../../lib/colors";

/** A person's initial on their colour. Decorative: the name is always written next to it. */
export function PersonDot({ person, size = "md", className }: { person: MoneyPerson | undefined; size?: "sm" | "md" | "lg"; className?: string }) {
  const name = person?.name ?? "?";
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: person?.color ?? PERSON_COLORS[PERSON_COLORS.length - 1] }}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white",
        size === "sm" && "size-7 text-xs",
        size === "md" && "size-9 text-sm",
        size === "lg" && "size-12 text-base",
        className,
      )}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/** "Guest" tag next to a guest's name. */
export function GuestTag() {
  return <span className="rounded-full bg-highlight px-2 py-0.5 text-[11px] font-semibold text-highlight-fg">Guest</span>;
}
