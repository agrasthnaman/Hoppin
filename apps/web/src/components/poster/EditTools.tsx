import { ArrowLeftRight, BringToFront, Crop, ImagePlus, Move, RotateCcw, RotateCw, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { MAX_SCALE, MAX_ZOOM, MIN_SCALE, normAngle } from "../../poster/gestures";
import type { PhotoSource, SlotEdit } from "../../poster/types";
import { Button } from "../ui/Button";
import { BitmapThumb } from "./BitmapThumb";
import type { EditMode } from "./SlotHandles";

function Tool({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-2xl bg-raised text-xs font-semibold text-fg transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-accent"
    >
      {icon}
      {label}
    </button>
  );
}

export interface EditToolsProps {
  index: number;
  photo: PhotoSource | null | undefined;
  edit: SlotEdit;
  baseRot: number;
  mode: EditMode;
  canSwap: boolean;
  onMode: (mode: EditMode) => void;
  onEdit: (change: Partial<SlotEdit>) => void;
  onReplace: () => void;
  onSwap: () => void;
  onFront: () => void;
  onReset: () => void;
  onRemove: () => void;
  onDone: () => void;
}

/** The controls for the selected photo: move or fit, turn, size or zoom, and quick actions. */
export function EditTools({ index, photo, edit, baseRot, mode, canSwap, onMode, onEdit, onReplace, onSwap, onFront, onReset, onRemove, onDone }: EditToolsProps) {
  const angle = Math.round(normAngle(baseRot + edit.rot));
  const crop = mode === "crop";
  const sizeValue = Math.round((crop ? edit.z : edit.sc) * 100);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="overflow-hidden rounded-xl">{photo ? <BitmapThumb photo={photo} size={40} label="" /> : <span className="block size-10 bg-raised" />}</span>
        <h3 className="flex-1 font-semibold">Photo {index + 1}</h3>
        <Button variant="secondary" className="min-h-9 px-4" onClick={onDone}>
          Done
        </Button>
      </div>
      <div role="radiogroup" aria-label="What dragging does" className="flex rounded-2xl bg-raised p-1">
        {(
          [
            ["move", "Move and turn", <Move key="m" aria-hidden="true" className="size-4" />],
            ["crop", "Fit in frame", <Crop key="c" aria-hidden="true" className="size-4" />],
          ] as const
        ).map(([value, label, icon]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => onMode(value)}
            className={cn(
              "flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-muted transition-colors focus-visible:outline-2 focus-visible:outline-accent",
              mode === value && "bg-surface text-fg shadow-card",
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>
      <label className="grid grid-cols-[4rem_1fr_3rem] items-center gap-2 text-sm font-medium text-muted">
        Turn
        <input type="range" min={-180} max={180} value={angle} onChange={(e) => onEdit({ rot: Number(e.target.value) - baseRot })} className="accent-[var(--color-link)]" />
        <output className="text-right text-fg">{angle}°</output>
      </label>
      <label className="grid grid-cols-[4rem_1fr_3rem] items-center gap-2 text-sm font-medium text-muted">
        {crop ? "Zoom" : "Size"}
        <input
          type="range"
          min={crop ? 100 : MIN_SCALE * 100}
          max={crop ? MAX_ZOOM * 100 : MAX_SCALE * 100}
          value={sizeValue}
          onChange={(e) => onEdit(crop ? { z: Number(e.target.value) / 100 } : { sc: Number(e.target.value) / 100 })}
          className="accent-[var(--color-link)]"
        />
        <output className="text-right text-fg">{sizeValue}%</output>
      </label>
      <div className="flex gap-1.5">
        <Tool label="Replace" icon={<ImagePlus aria-hidden="true" className="size-5" />} onClick={onReplace} />
        {canSwap && <Tool label="Swap" icon={<ArrowLeftRight aria-hidden="true" className="size-5" />} onClick={onSwap} />}
        <Tool label="Turn 90°" icon={<RotateCw aria-hidden="true" className="size-5" />} onClick={() => onEdit({ rot: edit.rot + 90 })} />
        <Tool label="Front" icon={<BringToFront aria-hidden="true" className="size-5" />} onClick={onFront} />
        <Tool label="Reset" icon={<RotateCcw aria-hidden="true" className="size-5" />} onClick={onReset} />
        <Tool label="Remove" icon={<Trash2 aria-hidden="true" className="size-5" />} onClick={onRemove} />
      </div>
    </div>
  );
}
