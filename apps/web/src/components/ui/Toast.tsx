import { AnimatePresence, m } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { spring } from "../../lib/motion";

export interface ToastMessage {
  id: number;
  text: string;
  /** Offers an Undo button for a few seconds. */
  undo?: () => void;
}

/** One short message at a time. Returns the current message, a way to show one, and a way to close it. */
export function useToast(): [ToastMessage | null, (text: string, undo?: () => void) => void, () => void] {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const counter = useRef(0);
  const show = useCallback((text: string, undo?: () => void) => {
    counter.current += 1;
    setToast({ id: counter.current, text, ...(undo ? { undo } : {}) });
  }, []);
  const close = useCallback(() => setToast(null), []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast((t) => (t?.id === toast.id ? null : t)), toast.undo ? 6000 : 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  return [toast, show, close];
}

/** A short confirmation above the navigation bar, read out politely by screen readers. */
export function Toast({ toast, onClose }: { toast: ToastMessage | null; onClose: () => void }) {
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-24 z-[70] flex justify-center md:bottom-6">
      <AnimatePresence>
        {toast && (
          <m.div
            key={toast.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={spring}
            className="pointer-events-auto flex max-w-md items-center gap-3 rounded-3xl bg-fg py-2.5 pl-4 pr-2 text-sm font-medium text-bg shadow-card"
          >
            <span>{toast.text}</span>
            {toast.undo && (
              <button
                type="button"
                onClick={() => {
                  toast.undo?.();
                  onClose();
                }}
                className="min-h-9 shrink-0 rounded-full px-3 font-bold underline focus-visible:outline-2 focus-visible:outline-current"
              >
                Undo
              </button>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
