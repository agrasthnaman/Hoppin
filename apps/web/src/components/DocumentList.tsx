import { visibleDocuments, type MemberRef, type TripDocument } from "@hoppin/core";
import { FileText } from "lucide-react";
import { useState } from "react";
import type { Person } from "./DayView";

export interface DocumentListProps {
  documents: TripDocument[];
  member: MemberRef;
  people: Record<string, Person>;
  /** Opens the document (for example fetches a signed link and shows it). May fail. */
  onOpen: (doc: TripDocument) => void | Promise<void>;
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Documents this person is allowed to see. Personal ones are marked, and never shown to other members. */
export function DocumentList({ documents, member, people, onOpen }: DocumentListProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const docs = visibleDocuments(documents, member);

  async function open(doc: TripDocument) {
    setFailed(null);
    try {
      await onOpen(doc);
    } catch {
      setFailed(doc.fileName);
    }
  }

  if (docs.length === 0) return <p className="text-muted">No documents yet.</p>;
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {docs.map((doc) => {
          const meta =
            doc.scope === "personal"
              ? doc.ownerId === member.userId
                ? "Personal"
                : `Personal · ${people[doc.ownerId]?.name ?? "Someone"}`
              : capitalise(doc.kind);
          return (
            <li key={doc.id} className="flex items-center gap-3 rounded-card border border-line bg-surface p-3">
              <FileText aria-hidden="true" className="size-5 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{doc.fileName}</p>
                <p className="text-xs text-muted">{meta}</p>
              </div>
              <button
                type="button"
                aria-label={`Open ${doc.fileName}`}
                onClick={() => void open(doc)}
                className="min-h-11 rounded-full px-4 text-sm font-semibold text-link hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent"
              >
                Open
              </button>
            </li>
          );
        })}
      </ul>
      {failed && (
        <p role="alert" className="text-sm text-danger-fg">
          Couldn't open {failed}. Check your connection and try again.
        </p>
      )}
    </div>
  );
}
