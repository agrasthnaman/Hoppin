import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, m, useDragControls } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { shouldDismissSheet } from "../../lib/gestures";
import { spring } from "../../lib/motion";

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}

/**
 * Bottom sheet on phones (springs up, drag the handle down to dismiss), centred dialog on wide screens (fades and
 * scales in). Focus is trapped and Escape closes it.
 */
export function Sheet({ open, onOpenChange, title, description, children }: SheetProps) {
  const desktop = useIsDesktop();
  const controls = useDragControls();
  const pickingFile = useRef(false);
  useEffect(() => {
    if (!open) return;
    const note = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest("input[type='file']")) pickingFile.current = true;
    };
    const release = () => {
      window.setTimeout(() => {
        pickingFile.current = false;
      }, 400);
    };
    document.addEventListener("pointerdown", note, true);
    document.addEventListener("change", release, true);
    document.addEventListener("cancel", release, true);
    return () => {
      document.removeEventListener("pointerdown", note, true);
      document.removeEventListener("change", release, true);
      document.removeEventListener("cancel", release, true);
    };
  }, [open]);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <m.div className="fixed inset-0 z-[55] bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              forceMount
              onPointerDownOutside={(event) => {
                if (!pickingFile.current) return;
                event.preventDefault();
              }}
            >
              <m.div
                className="fixed inset-x-0 bottom-0 z-[60] max-h-[85dvh] overflow-y-auto rounded-t-[2rem] bg-surface p-5 pt-2 text-fg shadow-card
                  md:inset-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl md:pt-5"
                initial={desktop ? { opacity: 0, scale: 0.96 } : { y: "100%" }}
                animate={desktop ? { opacity: 1, scale: 1 } : { y: 0 }}
                exit={desktop ? { opacity: 0, scale: 0.96 } : { y: "100%" }}
                transition={spring}
                drag={desktop ? false : "y"}
                dragListener={false}
                dragControls={controls}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.6 }}
                dragMomentum={false}
                onDragEnd={(_, info) => {
                  if (shouldDismissSheet(info.offset.y, info.velocity.y)) onOpenChange(false);
                }}
              >
                <div
                  aria-hidden="true"
                  onPointerDown={(e) => controls.start(e)}
                  className="mx-auto -mt-1 mb-1 flex h-7 w-24 touch-none cursor-grab items-center justify-center md:hidden"
                >
                  <span className="h-1.5 w-10 rounded-full bg-line" />
                </div>
                <div className="mb-3 flex items-start justify-between gap-4">
                  <Dialog.Title className="font-display text-xl font-bold">{title}</Dialog.Title>
                  <Dialog.Close
                    aria-label="Close"
                    className="rounded-full p-2 hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <X aria-hidden="true" className="size-5" />
                  </Dialog.Close>
                </div>
                {description ? (
                  <Dialog.Description className="mb-3 text-sm text-muted">{description}</Dialog.Description>
                ) : (
                  <Dialog.Description className="sr-only">{title}</Dialog.Description>
                )}
                {children}
              </m.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
