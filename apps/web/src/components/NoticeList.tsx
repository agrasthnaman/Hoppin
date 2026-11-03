import { describeNotice, type ConflictNotice } from "@hoppin/core";
import { TriangleAlert } from "lucide-react";

export interface NoticeListProps {
  notices: ConflictNotice[];
  onDismiss: (id: string) => void;
}

/** What happened to this person's offline changes (a clash, a refusal, a deleted item), until they dismiss it. */
export function NoticeList({ notices, onDismiss }: NoticeListProps) {
  if (notices.length === 0) return null;
  return (
    <>
      {notices.map((notice) => (
        <div key={notice.id} role="alert" className="flex items-start gap-2 rounded-card bg-danger-bg px-4 py-2.5 text-sm font-medium text-danger-fg">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span className="flex-1">{describeNotice(notice)}</span>
          <button
            type="button"
            onClick={() => onDismiss(notice.id)}
            className="shrink-0 rounded-full px-3 py-1 font-semibold underline focus-visible:outline-2 focus-visible:outline-current"
          >
            Dismiss
          </button>
        </div>
      ))}
    </>
  );
}
