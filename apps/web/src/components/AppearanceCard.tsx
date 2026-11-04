import { useTheme, type Mode } from "../theme/ThemeProvider";
import { Card } from "./ui/Card";

const MODE_LABEL: { value: Mode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/** Pick a palette and light or dark (light is the default). Applies straight away and is remembered on this device. */
export function AppearanceCard() {
  const { palette, mode, palettes, setPalette, setMode } = useTheme();
  return (
    <Card className="flex flex-col gap-4">
      <h3 className="font-display text-lg font-bold">Appearance</h3>

      <div role="radiogroup" aria-label="Colours" className="flex flex-col gap-2">
        {palettes.map((p) => (
          <label
            key={p.id}
            className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl bg-raised p-3 has-[:checked]:bg-accent-soft has-[:checked]:ring-2 has-[:checked]:ring-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
          >
            <input type="radio" name="palette" className="sr-only" checked={palette === p.id} onChange={() => setPalette(p.id)} />
            <span aria-hidden="true" className="flex -space-x-2">
              {[p.light.hero, p.light.accent, p.light.highlight].map((color, i) => (
                <span key={i} className="size-7 rounded-full ring-2 ring-surface" style={{ backgroundColor: color }} />
              ))}
            </span>
            <span className="flex flex-col">
              <span className="font-semibold">{p.name}</span>
              <span className="text-xs text-muted">{p.tagline}</span>
            </span>
          </label>
        ))}
      </div>

      <div role="radiogroup" aria-label="Light or dark" className="grid grid-cols-2 gap-1 rounded-full bg-raised p-1">
        {MODE_LABEL.map(({ value, label }) => (
          <label
            key={value}
            className="flex min-h-10 cursor-pointer items-center justify-center rounded-full text-sm font-semibold text-muted has-[:checked]:bg-surface has-[:checked]:text-fg has-[:checked]:shadow-card has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
          >
            <input type="radio" name="mode" className="sr-only" checked={mode === value} onChange={() => setMode(value)} />
            {label}
          </label>
        ))}
      </div>
    </Card>
  );
}
