import { describe, expect, it } from "vitest";
import { add } from "../src/index";

describe("core workspace", () => {
  it("runs TypeScript tests", () => {
    expect(add(2, 3)).toBe(5);
  });
});
