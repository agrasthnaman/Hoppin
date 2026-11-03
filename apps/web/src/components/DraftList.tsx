import { fieldLabel, type OutboxRecord } from "@hoppin/core";
import { useState } from "react";
import { Button } from "./ui/Button";

export interface DraftListProps {
  drafts: OutboxRecord[];
  onApply: (draft: OutboxRecord) => Promise<"queued" | "gone">;
  onDiscard: (id: string) => void;
}

function show(value: unknown): string {
  if (value === null || value === undefined || value === "") return "(empty)";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return new Date(value).toLocaleString();
  return String(value);
}

function describe(draft: OutboxRecord): string {
  if (draft.kind === "update") return `Your change to the ${fieldLabel(draft.field)} of "${draft.itemTitle ?? "an item"}": ${show(draft.value)}`;
  if (draft.kind === "create") return `A new plan: "${draft.values.title}"`;
  return "A reply";
}

/** Changes that could not be applied. Each can be put back in the queue as a newer change, or thrown away. */
export function DraftList({ drafts, onApply, onDiscard }: DraftListProps) {
  const [gone, setGone] = useState<string | null>(null);
  if (drafts.length === 0) return <p className="text-sm text-muted">No unsent changes.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {drafts.map((draft) => (
        <li key={draft.id} className="flex flex-col gap-2 rounded-card border border-line p-3">
          <p className="text-sm">{describe(draft)}</p>
          {gone === draft.id && <p role="status" className="text-sm text-danger-fg">That item no longer exists, so this can't be applied.</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void onApply(draft).then((r) => setGone(r === "gone" ? draft.id : null))}>
              Apply my version
            </Button>
            <Button variant="ghost" onClick={() => onDiscard(draft.id)}>
              Discard
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
