import * as RadixAvatar from "@radix-ui/react-avatar";
import { cn } from "../../lib/cn";

export interface AvatarProps {
  name: string;
  color: string;
  className?: string;
}

/** Round badge with the member's first letter on their personal colour. */
export function Avatar({ name, color, className }: AvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <RadixAvatar.Root
      className={cn("inline-flex size-9 select-none items-center justify-center rounded-full", className)}
      style={{ backgroundColor: color }}
    >
      <RadixAvatar.Fallback className="text-sm font-semibold text-white">{initial}</RadixAvatar.Fallback>
    </RadixAvatar.Root>
  );
}
