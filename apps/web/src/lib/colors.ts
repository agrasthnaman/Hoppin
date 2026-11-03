/** Deep colours that keep white text at 4.5:1 or better. Each member gets one for avatars and chips. */
export const PERSON_COLORS = [
  "#6d28d9",
  "#c2410c",
  "#0f766e",
  "#1d4ed8",
  "#be185d",
  "#15803d",
  "#92400e",
  "#475569",
] as const;

export function personColor(index: number): string {
  const n = PERSON_COLORS.length;
  return PERSON_COLORS[((index % n) + n) % n] as string;
}
