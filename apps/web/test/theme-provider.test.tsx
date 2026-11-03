import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppearanceCard } from "../src/components/AppearanceCard";
import palettes from "../src/theme/palettes.json";
import { ThemeProvider, useTheme } from "../src/theme/ThemeProvider";

const root = document.documentElement;
let systemDark = false;
let listeners: Array<() => void> = [];

function mockMatchMedia() {
  window.matchMedia = vi.fn().mockImplementation(() => ({
    get matches() { return systemDark; },
    addEventListener: (_: string, cb: () => void) => void listeners.push(cb),
    removeEventListener: (_: string, cb: () => void) => void (listeners = listeners.filter((l) => l !== cb)),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  localStorage.clear();
  root.removeAttribute("data-palette");
  root.removeAttribute("data-theme");
  document.head.innerHTML = '<meta name="theme-color" content="#000000">';
  systemDark = false;
  listeners = [];
  mockMatchMedia();
});
afterEach(() => vi.restoreAllMocks());

const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;

describe("ThemeProvider", () => {
  it("starts on the default palette, following the phone's light or dark setting", () => {
    renderHook(() => useTheme(), { wrapper });
    expect(root.dataset.palette).toBe("rose");
    expect(root.hasAttribute("data-theme")).toBe(false);
  });

  it("changes palette and remembers it", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => result.current.setPalette("lilac"));
    expect(root.dataset.palette).toBe("lilac");
    expect(localStorage.getItem("hoppin.palette")).toBe("lilac");
  });

  it("forces light or dark, and 'system' goes back to following the phone", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => result.current.setMode("dark"));
    expect(root.dataset.theme).toBe("dark");
    act(() => result.current.setMode("light"));
    expect(root.dataset.theme).toBe("light");
    act(() => result.current.setMode("system"));
    expect(root.hasAttribute("data-theme")).toBe(false);
    expect(localStorage.getItem("hoppin.mode")).toBe("system");
  });

  it("restores what was chosen last time", () => {
    localStorage.setItem("hoppin.palette", "tangerine");
    localStorage.setItem("hoppin.mode", "dark");
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.palette).toBe("tangerine");
    expect(result.current.mode).toBe("dark");
    expect(root.dataset.palette).toBe("tangerine");
    expect(root.dataset.theme).toBe("dark");
  });

  it("ignores stored values it does not know", () => {
    localStorage.setItem("hoppin.palette", "neon-green");
    localStorage.setItem("hoppin.mode", "sepia");
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.palette).toBe("rose");
    expect(result.current.mode).toBe("system");
  });

  it("still works when the browser will not store anything (private windows)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => result.current.setPalette("lilac"));
    expect(root.dataset.palette).toBe("lilac");
  });

  it("colours the browser's address bar to match, and follows the phone switching to dark", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    const bar = () => document.querySelector('meta[name="theme-color"]')!.getAttribute("content");
    expect(bar()).toBe(palettes.palettes[0]!.light.bg);
    systemDark = true;
    act(() => listeners.forEach((l) => l()));
    expect(bar()).toBe(palettes.palettes[0]!.dark.bg);
    act(() => result.current.setPalette("lilac"));
    expect(bar()).toBe(palettes.palettes.find((p) => p.id === "lilac")!.dark.bg);
  });
});

describe("the first-paint script in index.html", () => {
  const html = readFileSync(join(process.cwd(), "index.html"), "utf8");

  it("knows every palette, so a saved choice is applied before the page is drawn", () => {
    for (const p of palettes.palettes) expect(html).toContain(`"${p.id}"`);
    expect(html).toContain("hoppin.palette");
    expect(html).toContain("hoppin.mode");
  });
});

describe("AppearanceCard", () => {
  const setup = () => render(<ThemeProvider><AppearanceCard /></ThemeProvider>);

  it("offers each palette by name, with the current one marked", () => {
    setup();
    const group = screen.getByRole("radiogroup", { name: "Colours" });
    for (const p of palettes.palettes) expect(group).toHaveTextContent(p.name);
    expect(screen.getByRole("radio", { name: /Rose & teal/ })).toBeChecked();
  });

  it("changing the palette applies it straight away", async () => {
    setup();
    await userEvent.click(screen.getByRole("radio", { name: /Tangerine & sky/ }));
    expect(screen.getByRole("radio", { name: /Tangerine & sky/ })).toBeChecked();
    expect(root.dataset.palette).toBe("tangerine");
  });

  it("lets the person pick system, light or dark", async () => {
    setup();
    const mode = screen.getByRole("radiogroup", { name: "Light or dark" });
    expect(mode).toHaveTextContent("System");
    await userEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(root.dataset.theme).toBe("dark");
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
  });
});
