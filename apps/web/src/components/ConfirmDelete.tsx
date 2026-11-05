import { Trash2 } from "lucide-react";
import { cn } from "../lib/cn";
import { Button } from "./ui/Button";
import { Sheet } from "./ui/Sheet";

/** A bin the person taps before a plan is deleted. The name is for the screen reader. */
export function BinButton({ label, onClick, onHero = false }: { label: string; onClick: () => void; onHero?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-accent",
        onHero ? "text-hero-fg hover:bg-white/10" : "text-danger-fg hover:bg-raised",
      )}
    >
      <Trash2 aria-hidden="true" className="size-4" />
    </button>
  );
}

/** Asks before a plan is taken off the trip. */
export function ConfirmDelete({ name, open, onConfirm, onCancel }: { name: string; open: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onCancel()} title={`Delete ${name}?`} description="This takes it off the trip.">
      <div className="flex gap-2">
        <Button onClick={onConfirm}>Delete it</Button>
        <Button variant="ghost" onClick={onCancel}>
          Keep it
        </Button>
      </div>
    </Sheet>
  );
}
