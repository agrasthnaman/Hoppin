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
  it("starts on the default palette in the light theme", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(root.dataset.palette).toBe("cobalt");
    expect(result.current.mode).toBe("light");
    expect(root.dataset.theme).toBe("light");
    expect(root.style.colorScheme).toBe("light");
  });

  it("stays light even when the phone is in dark mode, and does not react to it switching", () => {
    systemDark = true;
    renderHook(() => useTheme(), { wrapper });
    expect(root.dataset.theme).toBe("light");
    expect(listeners).toHaveLength(0);
    systemDark = false;
    act(() => listeners.forEach((l) => l()));
    expect(root.dataset.theme).toBe("light");
  });

  it("changes palette and remembers it", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => result.current.setPalette("lilac"));
    expect(root.dataset.palette).toBe("lilac");
    expect(localStorage.getItem("hoppin.palette")).toBe("lilac");
  });

  it("switches between light and dark and remembers the choice", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => result.current.setMode("dark"));
    expect(root.dataset.theme).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
    expect(localStorage.getItem("hoppin.mode")).toBe("dark");
    act(() => result.current.setMode("light"));
    expect(root.dataset.theme).toBe("light");
    expect(localStorage.getItem("hoppin.mode")).toBe("light");
  });

  it("an old 'follow the phone' choice becomes light", () => {
    localStorage.setItem("hoppin.mode", "system");
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.mode).toBe("light");
    expect(root.dataset.theme).toBe("light");
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
    expect(result.current.palette).toBe("cobalt");
    expect(result.current.mode).toBe("light");
  });

  it("still works when the browser will not store anything (private windows)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const { result } = renderHook(() => useTheme(), { wrapper });
    act(() => result.current.setPalette("lilac"));
    expect(root.dataset.palette).toBe("lilac");
  });

  it("colours the browser's address bar to match the theme and palette", () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    const bar = () => document.querySelector('meta[name="theme-color"]')!.getAttribute("content");
    expect(bar()).toBe(palettes.palettes[0]!.light.bg);
    act(() => result.current.setMode("dark"));
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

  it("is light unless dark was chosen, and never looks at the phone's setting", () => {
    expect(html).toContain('m === "dark" ? "dark" : "light"');
    expect(html).not.toContain("prefers-color-scheme");
  });
});

describe("AppearanceCard", () => {
  const setup = () => render(<ThemeProvider><AppearanceCard /></ThemeProvider>);

  it("offers each palette by name, with the current one marked", () => {
    setup();
    const group = screen.getByRole("radiogroup", { name: "Colours" });
    for (const p of palettes.palettes) expect(group).toHaveTextContent(p.name);
    expect(screen.getByRole("radio", { name: /Blue & orange/ })).toBeChecked();
  });

  it("changing the palette applies it straight away", async () => {
    setup();
    await userEvent.click(screen.getByRole("radio", { name: /Tangerine & sky/ }));
    expect(screen.getByRole("radio", { name: /Tangerine & sky/ })).toBeChecked();
    expect(root.dataset.palette).toBe("tangerine");
  });

  it("lets the person pick light or dark, with light on by default and no 'System' option", async () => {
    setup();
    const mode = screen.getByRole("radiogroup", { name: "Light or dark" });
    expect(mode).not.toHaveTextContent("System");
    expect(screen.getByRole("radio", { name: "Light" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(root.dataset.theme).toBe("dark");
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
  });
});
