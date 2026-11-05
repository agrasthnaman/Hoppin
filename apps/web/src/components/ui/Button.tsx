import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "ghost";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:brightness-95",
  secondary: "bg-raised text-fg hover:brightness-95",
  ghost: "bg-transparent text-fg hover:bg-raised",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Shows the dots and ignores further taps until the work finishes. */
  busy?: boolean;
}

export function Button({ variant = "primary", className, type = "button", busy = false, disabled, children, ...props }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-sm font-semibold transition-all active:scale-[0.97]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
      aria-busy={busy || undefined}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}
