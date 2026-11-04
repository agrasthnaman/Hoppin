import type { ItemKind } from "@hoppin/core";
import { BedDouble, Bus, MapPin, Plane, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "../lib/cn";

/** How each kind of plan looks, so a card can be told apart at a glance. Colours come from the theme (light and dark). */
export const KIND_STYLE: Record<ItemKind, { label: string; icon: LucideIcon; tag: string; tagOnHero: string }> = {
  flight: { label: "Flight", icon: Plane, tag: "bg-hero text-hero-fg", tagOnHero: "bg-white/20 text-hero-fg" },
  stay: { label: "Stay", icon: BedDouble, tag: "bg-info-bg text-info-fg", tagOnHero: "bg-white/20 text-hero-fg" },
  transport: { label: "Transport", icon: Bus, tag: "bg-warn-bg text-warn-fg", tagOnHero: "bg-white/20 text-hero-fg" },
  activity: { label: "Activity", icon: Sparkles, tag: "bg-accent-soft text-accent-soft-fg", tagOnHero: "bg-white/20 text-hero-fg" },
  plan: { label: "Plan", icon: MapPin, tag: "bg-raised text-muted", tagOnHero: "bg-white/20 text-hero-fg" },
};

/** A small pill with the kind's icon and name. */
export function KindTag({ kind, onHero = false, className }: { kind: ItemKind; onHero?: boolean; className?: string }) {
  const { label, icon: Icon, tag, tagOnHero } = KIND_STYLE[kind];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", onHero ? tagOnHero : tag, className)}>
      <Icon aria-hidden="true" className="size-3.5" />
      {label}
    </span>
  );
}
