import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { spring } from "../lib/motion";
import Updates from "../routes/Updates";

/** Updates slides in from the left over the page you already have open, and slides back when you close it. */
export function UpdatesPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <m.div className="fixed inset-0 z-[55] bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount>
              <m.div
                data-side="left"
                className="fixed inset-y-0 left-0 z-[60] flex h-dvh w-[min(24rem,88vw)] flex-col bg-surface text-fg shadow-card outline-none"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={spring}
              >
                <div className="flex items-center justify-between gap-3 px-5 pt-5">
                  <Dialog.Title className="page-title text-3xl">Updates</Dialog.Title>
                  <Dialog.Close
                    aria-label="Close"
                    className="inline-flex size-11 items-center justify-center rounded-full hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <X aria-hidden="true" className="size-5" />
                  </Dialog.Close>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-4">
                  <Updates />
                </div>
              </m.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
