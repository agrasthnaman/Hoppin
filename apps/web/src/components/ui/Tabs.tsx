import * as RadixTabs from "@radix-ui/react-tabs";
import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";

export const Tabs = RadixTabs.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof RadixTabs.List>) {
  return <RadixTabs.List className={cn("inline-flex gap-1 rounded-full bg-raised p-1", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof RadixTabs.Trigger>) {
  return (
    <RadixTabs.Trigger
      className={cn(
        "min-h-9 rounded-full px-4 text-sm font-medium text-muted transition-colors",
        "data-[state=active]:bg-surface data-[state=active]:text-fg data-[state=active]:shadow-card",
        "focus-visible:outline-2 focus-visible:outline-accent",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof RadixTabs.Content>) {
  return <RadixTabs.Content className={cn("mt-4 focus-visible:outline-2 focus-visible:outline-accent", className)} {...props} />;
}
