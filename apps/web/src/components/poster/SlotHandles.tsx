import { RotateCw } from "lucide-react";
import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "../../lib/cn";
import { clampScale, cropBy, moveBy, snapTurn } from "../../poster/gestures";
import type { PlacedSlot } from "../../poster/slots";
import type { SlotEdit } from "../../poster/types";

export type EditMode = "move" | "crop";

export interface SlotHandlesProps {
  slots: PlacedSlot[];
  /** CSS pixels per poster pixel. */
  scale: number;
  posterW: number;
  posterH: number;
  selected: number;
  mode: EditMode;
  filled: (index: number) => boolean;
  onSelect: (index: number) => void;
  onPickFor: (index: number) => void;
  onEdit: (index: number, change: Partial<SlotEdit>) => void;
  onToggleMode: () => void;
  /** The angle or size while a handle is held, for the badge above the preview. */
  onReadout: (text: string | null, snapped?: boolean) => void;
}

type Drag =
  | { kind: "move" | "crop"; index: number; x0: number; y0: number; start: SlotEdit; moved: boolean }
  | { kind: "turn" | "size"; index: number; cx: number; cy: number; a0: number; d0: number; start: SlotEdit; baseRot: number }
  | { kind: "pinch"; index: number; d0: number; a0: number; start: SlotEdit; baseRot: number };

/** Invisible touch targets over the drawn photos, with turn and resize handles on the selected one. */
export function SlotHandles({ slots, scale, posterW, posterH, selected, mode, filled, onSelect, onPickFor, onEdit, onToggleMode, onReadout }: SlotHandlesProps) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastTap = useRef({ at: 0, index: -1 });
  const order = [...slots].sort((a, b) => (a.index === selected ? 1 : 0) - (b.index === selected ? 1 : 0));
  const screenW = posterW * scale;
  const screenH = posterH * scale;

  function centreOf(slot: PlacedSlot) {
    const r = box.current!.getBoundingClientRect();
    return { cx: r.left + slot.cx * scale, cy: r.top + slot.cy * scale };
  }

  function down(e: PointerEvent, slot: PlacedSlot, handle?: "turn" | "size") {
    e.stopPropagation();
    if (!filled(slot.index)) {
      onSelect(slot.index);
      onPickFor(slot.index);
      return;
    }
    if (selected !== slot.index) onSelect(slot.index);
    box.current?.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      const [a, b] = pts as [{ x: number; y: number }, { x: number; y: number }];
      drag.current = { kind: "pinch", index: slot.index, d0: Math.hypot(b.x - a.x, b.y - a.y) || 1, a0: Math.atan2(b.y - a.y, b.x - a.x), start: slot.edit, baseRot: slot.baseRot };
      return;
    }
    if (handle) {
      const { cx, cy } = centreOf(slot);
      drag.current = { kind: handle, index: slot.index, cx, cy, a0: Math.atan2(e.clientY - cy, e.clientX - cx), d0: Math.hypot(e.clientX - cx, e.clientY - cy) || 1, start: slot.edit, baseRot: slot.baseRot };
      return;
    }
    drag.current = { kind: mode, index: slot.index, x0: e.clientX, y0: e.clientY, start: slot.edit, moved: false };
  }

  function move(e: PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const slot = slots[d.index];
    if (!slot) return;
    if (d.kind === "move" || d.kind === "crop") {
      const dx = e.clientX - d.x0;
      const dy = e.clientY - d.y0;
      if (Math.hypot(dx, dy) > 3) d.moved = true;
      onEdit(d.index, d.kind === "move" ? moveBy(d.start, dx, dy, screenW, screenH) : cropBy(d.start, dx, dy, slot.rot, slot.w * scale * slot.sc));
      return;
    }
    if (d.kind === "pinch") {
      const pts = [...pointers.current.values()];
      if (pts.length < 2) return;
      const [a, b] = pts as [{ x: number; y: number }, { x: number; y: number }];
      const turn = snapTurn(d.baseRot, d.start.rot + ((Math.atan2(b.y - a.y, b.x - a.x) - d.a0) * 180) / Math.PI);
      onEdit(d.index, { rot: turn.rot, sc: clampScale((d.start.sc * Math.hypot(b.x - a.x, b.y - a.y)) / d.d0) });
      onReadout(`${turn.shown}°`, turn.snapped);
      return;
    }
    if (d.kind === "turn") {
      const turn = snapTurn(d.baseRot, d.start.rot + ((Math.atan2(e.clientY - d.cy, e.clientX - d.cx) - d.a0) * 180) / Math.PI);
      onEdit(d.index, { rot: turn.rot });
      onReadout(turn.snapped ? `${turn.shown}° · straight` : `${turn.shown}°`, turn.snapped);
      return;
    }
    if (d.kind !== "size") return;
    const sc = clampScale((d.start.sc * Math.hypot(e.clientX - d.cx, e.clientY - d.cy)) / d.d0);
    onEdit(d.index, { sc });
    onReadout(`${Math.round(sc * 100)}%`);
  }

  function up(e: PointerEvent) {
    pointers.current.delete(e.pointerId);
    const d = drag.current;
    if (d && (d.kind === "move" || d.kind === "crop") && !d.moved) {
      const now = performance.now();
      if (lastTap.current.index === d.index && now - lastTap.current.at < 320) {
        onToggleMode();
        lastTap.current = { at: 0, index: -1 };
      } else lastTap.current = { at: now, index: d.index };
    }
    if (pointers.current.size === 0) {
      drag.current = null;
      onReadout(null);
    }
  }

  function key(e: KeyboardEvent, slot: PlacedSlot) {
    const step = e.shiftKey ? 3 : 0.8;
    const changes: Record<string, Partial<SlotEdit>> = {
      ArrowLeft: { tx: slot.edit.tx - step },
      ArrowRight: { tx: slot.edit.tx + step },
      ArrowUp: { ty: slot.edit.ty - step },
      ArrowDown: { ty: slot.edit.ty + step },
      "[": { rot: slot.edit.rot - 5 },
      "]": { rot: slot.edit.rot + 5 },
      "+": { sc: clampScale(slot.edit.sc + 0.05) },
      "=": { sc: clampScale(slot.edit.sc + 0.05) },
      "-": { sc: clampScale(slot.edit.sc - 0.05) },
    };
    if (e.key === "Escape") {
      onSelect(-1);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!filled(slot.index)) onPickFor(slot.index);
      onSelect(slot.index);
      return;
    }
    const change = changes[e.key];
    if (!change) return;
    e.preventDefault();
    onSelect(slot.index);
    onEdit(slot.index, change);
  }

  return (
    <div
      ref={box}
      className="absolute inset-0 touch-none"
      onPointerDown={() => onSelect(-1)}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      {order.map((slot) => {
        const isSel = slot.index === selected;
        const w = slot.w * scale;
        const h = slot.h * scale;
        return (
          <div
            key={slot.index}
            role="button"
            tabIndex={0}
            aria-label={filled(slot.index) ? `Photo ${slot.index + 1}. Arrow keys move it, [ and ] turn it, + and − resize it.` : `Empty frame ${slot.index + 1}. Add a photo.`}
            aria-pressed={isSel}
            onPointerDown={(e) => down(e, slot)}
            onKeyDown={(e) => key(e, slot)}
            className={cn("absolute outline-none", filled(slot.index) ? (mode === "crop" && isSel ? "cursor-move" : "cursor-grab") : "cursor-pointer")}
            style={{ left: slot.cx * scale - w / 2, top: slot.cy * scale - h / 2, width: w, height: h, transform: `rotate(${slot.rot}deg) scale(${slot.sc})`, zIndex: isSel ? 2 : 1 }}
          >
            {isSel && (
              <>
                <span
                  aria-hidden="true"
                  className={cn("pointer-events-none absolute -inset-1 rounded-lg border-2 border-white shadow-[0_0_0_1.5px_var(--color-link),0_0_0_6px_color-mix(in_srgb,var(--color-link)_20%,transparent)]", mode === "crop" && "border-dashed")}
                />
                {mode === "move" && (
                  <>
                    <span
                      aria-hidden="true"
                      onPointerDown={(e) => down(e, slot, "turn")}
                      className="absolute left-1/2 top-0 grid size-8 -translate-x-1/2 -translate-y-[calc(100%+12px)] cursor-grab place-items-center rounded-full bg-white text-link shadow-md"
                      style={{ scale: `${1 / slot.sc}` }}
                    >
                      <RotateCw className="size-4" />
                    </span>
                    <span
                      aria-hidden="true"
                      onPointerDown={(e) => down(e, slot, "size")}
                      className="absolute -bottom-3 -right-3 size-6 cursor-nwse-resize rounded-full border-4 border-link bg-white shadow-md"
                      style={{ scale: `${1 / slot.sc}` }}
                    />
                  </>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
