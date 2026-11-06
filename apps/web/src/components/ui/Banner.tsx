import { CloudOff, Clock, Info, TriangleAlert, Upload } from "lucide-react";
import { cn } from "../../lib/cn";

export type BannerKind = "offline" | "stale" | "conflict" | "pending" | "info";

const styles: Record<BannerKind, string> = {
  offline: "bg-info-bg text-info-fg",
  stale: "bg-warn-bg text-warn-fg",
  conflict: "bg-danger-bg text-danger-fg",
  pending: "bg-info-bg text-info-fg",
  info: "bg-info-bg text-info-fg",
};

const icons = { offline: CloudOff, stale: Clock, conflict: TriangleAlert, pending: Upload, info: Info } as const;

export interface BannerProps {
  kind: BannerKind;
  text: string;
  className?: string;
}

/** Trust cue shown at the top of screens. Conflicts interrupt screen readers; offline and stale are polite. */
export function Banner({ kind, text, className }: BannerProps) {
  const Icon = icons[kind];
  return (
    <div
      role={kind === "conflict" ? "alert" : "status"}
      aria-label={text}
      className={cn("flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium", styles[kind], className)}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span>{text}</span>
    </div>
  );
}
