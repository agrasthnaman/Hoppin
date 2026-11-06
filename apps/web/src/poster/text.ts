import type { Painter, TextStyle } from "./painter";

/** "Asha, Ravi, Meera" or "Asha, Ravi, Meera and 3 more". */
export function joinNames(names: string[], max = 3): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  if (names.length <= max) return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `${names.slice(0, max).join(", ")} and ${names.length - max} more`;
}

/** Cuts text to fit `maxWidth`, ending with an ellipsis. */
export function ellipsize(p: Painter, text: string, style: TextStyle, maxWidth: number): string {
  if (p.measure(text, style) <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (p.measure(text.slice(0, mid).trimEnd() + "…", style) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo).trimEnd() + "…";
}

/** Breaks text into lines no wider than `maxWidth`. Explicit line breaks are kept. */
export function wrapLines(p: Painter, text: string, style: TextStyle, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && p.measure(next, style) > maxWidth) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

/** The largest size (down to `min`) at which the text fits `maxWidth` on one line. */
export function fitSize(p: Painter, text: string, style: TextStyle, maxWidth: number, min: number): number {
  let size = style.size;
  while (size > min && p.measure(text, { ...style, size }) > maxWidth) size -= Math.max(1, size * 0.04);
  return Math.max(min, size);
}
