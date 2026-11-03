import { describe, expect, it } from "vitest";
import { PERSON_COLORS, personColor } from "../src/lib/colors";

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe("personColor", () => {
  it("cycles through the palette and handles negative indexes", () => {
    expect(personColor(0)).toBe(PERSON_COLORS[0]);
    expect(personColor(PERSON_COLORS.length)).toBe(PERSON_COLORS[0]);
    expect(personColor(-1)).toBe(PERSON_COLORS[PERSON_COLORS.length - 1]);
  });

  it("keeps white text readable (4.5:1) on every person colour", () => {
    for (const color of PERSON_COLORS) {
      const ratio = (1 + 0.05) / (luminance(color) + 0.05);
      expect(ratio, color).toBeGreaterThanOrEqual(4.5);
    }
  });
});
