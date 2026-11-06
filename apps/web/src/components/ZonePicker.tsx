import { zoneLabel } from "@hoppin/core";
import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "../lib/cn";
import { inputClass } from "../lib/forms";

export interface ZonePickerProps {
  /** The chosen zone, or "" for the trip's own. */
  value: string;
  /** Zones of the plans shown, the trip's own first. */
  zones: string[];
  deviceTz: string;
  at: number;
  onChange: (tz: string) => void;
}

interface Choice {
  value: string;
  label: string;
  /** Lower-case text the search box matches: the label and the zone's name. */
  search: string;
}

const allZones = (): string[] => {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [];
  }
};

/**
 * Which time zone a plan's times are shown in: the trip's own (the default), a place in the trip, this device, or any
 * zone. A small searchable list that opens under the button, so the long list of zones never fills the screen.
 */
export function ZonePicker({ value, zones, deviceTz, at, onChange }: ZonePickerProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const buttonId = `${id}-button`;
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const groups = useMemo(() => {
    const choice = (tz: string, label = zoneLabel(tz, at)): Choice => ({ value: tz, label, search: `${label} ${tz}`.toLowerCase().replace(/_/g, " ") });
    const [own, ...places] = zones;
    const taken = new Set([...zones, deviceTz]);
    return [
      { name: null, choices: [choice("", own ? `Trip time · ${zoneLabel(own, at)}` : "Trip time")] },
      { name: "Places in this trip", choices: places.map((tz) => choice(tz)) },
      { name: "This device", choices: zones.includes(deviceTz) ? [] : [choice(deviceTz)] },
      { name: "All time zones", choices: allZones().filter((tz) => !taken.has(tz)).map((tz) => choice(tz)) },
    ];
  }, [zones, deviceTz, at]);

  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () => groups.map((g) => ({ ...g, choices: q ? g.choices.filter((c) => c.search.includes(q)) : g.choices })).filter((g) => g.choices.length > 0),
    [groups, q],
  );
  const flat = shown.flatMap((g) => g.choices);
  const current = groups.flatMap((g) => g.choices).find((c) => c.value === value) ?? groups[0]!.choices[0]!;
  const optionId = (i: number) => `${id}-option-${i}`;

  function openList() {
    setQuery("");
    setActive(Math.max(0, groups.flatMap((g) => g.choices).findIndex((c) => c.value === value)));
    setOpen(true);
  }

  function close(refocus: boolean) {
    setOpen(false);
    if (refocus) button.current?.focus();
  }

  function choose(choice: Choice) {
    onChange(choice.value);
    close(true);
  }

  // A click or tap anywhere else closes the list.
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  // Keep the highlighted zone in view while moving with the keyboard.
  useEffect(() => {
    if (open) list.current?.querySelector(`#${CSS.escape(optionId(active))}`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, active]); // eslint-disable-line react-hooks/exhaustive-deps

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (flat.length === 0) return;
      setActive((i) => (event.key === "ArrowDown" ? Math.min(i + 1, flat.length - 1) : Math.max(i - 1, 0)));
    } else if (event.key === "PageDown" || event.key === "PageUp") {
      event.preventDefault();
      setActive((i) => Math.max(0, Math.min(flat.length - 1, i + (event.key === "PageDown" ? 8 : -8))));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const picked = flat[active];
      if (picked) choose(picked);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") {
      close(false);
    }
  }

  let index = -1;
  return (
    <div ref={root} className="relative flex min-w-0 items-center gap-2">
      <span id={labelId} className="shrink-0 text-sm font-semibold">
        Show times in
      </span>
      <button
        ref={button}
        id={buttonId}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${labelId} ${buttonId}`}
        onClick={() => (open ? close(false) : openList())}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-surface py-2 pl-4 pr-3 text-left text-sm font-semibold text-fg transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent sm:max-w-[20rem] sm:flex-none"
      >
        <span className="truncate">{current.label}</span>
        <ChevronDown aria-hidden="true" className={cn("ml-auto size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 flex w-full flex-col gap-2 rounded-card border border-line bg-surface p-2 shadow-card sm:w-80">
          <label className="relative block">
            <span className="sr-only">Search time zones</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 z-10 size-4 -translate-y-1/2 text-muted" />
            <input
              autoFocus
              type="search"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={flat[active] ? optionId(active) : undefined}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Search a city or GMT+8"
              autoComplete="off"
              enterKeyHint="done"
              className={cn(inputClass, "min-h-11 pl-10 text-sm")}
            />
          </label>
          <ul ref={list} id={listId} role="listbox" aria-label="Time zones" className="max-h-72 overflow-y-auto overscroll-contain">
            {shown.map((group) => (
              <li key={group.name ?? "trip"} role="presentation">
                {group.name && (
                  <p aria-hidden="true" className="sticky top-0 z-10 bg-surface px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">
                    {group.name}
                  </p>
                )}
                <ul role="group" aria-label={group.name ?? "Trip time"}>
                  {group.choices.map((choice) => {
                    index += 1;
                    const i = index;
                    const selected = choice.value === value;
                    return (
                      <li
                        key={choice.value || "trip"}
                        id={optionId(i)}
                        role="option"
                        aria-selected={selected}
                        onPointerMove={() => setActive(i)}
                        onClick={() => choose(choice)}
                        className={cn(
                          "flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl px-3 text-sm",
                          selected ? "bg-accent-soft font-semibold text-accent-soft-fg" : i === active ? "bg-raised" : "",
                          i === active && "outline-2 -outline-offset-2 outline-accent",
                        )}
                      >
                        <span className="truncate">{choice.label}</span>
                        {selected && <Check aria-hidden="true" className="ml-auto size-4 shrink-0" />}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
            {flat.length === 0 && (
              <li role="presentation" className="p-3 text-sm text-muted">
                No time zone matches "{query.trim()}". Try a city, like Tokyo.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
