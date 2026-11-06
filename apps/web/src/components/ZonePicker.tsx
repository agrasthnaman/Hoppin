import { zoneLabel } from "@hoppin/core";
import { ChevronDown } from "lucide-react";
import { useId, useMemo } from "react";

export interface ZonePickerProps {
  /** The chosen zone, or "" for the trip's own. */
  value: string;
  /** Zones of the plans shown, the trip's own first. */
  zones: string[];
  deviceTz: string;
  at: number;
  onChange: (tz: string) => void;
}

const allZones = (): string[] => {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [];
  }
};

/** Which time zone a plan's times are shown in: the trip's own (the default), a place in the trip, this device, or any zone. */
export function ZonePicker({ value, zones, deviceTz, at, onChange }: ZonePickerProps) {
  const id = useId();
  const [own, ...places] = zones;
  const others = useMemo(() => {
    const taken = new Set([...zones, deviceTz]);
    return allZones().filter((tz) => !taken.has(tz));
  }, [zones, deviceTz]);
  const option = (tz: string) => (
    <option key={tz} value={tz}>
      {zoneLabel(tz, at)}
    </option>
  );

  return (
    <div className="flex min-w-0 items-center gap-2">
      <label htmlFor={id} className="shrink-0 text-sm font-semibold">
        Show times in
      </label>
      <span className="relative min-w-0 flex-1">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-11 w-full truncate appearance-none sm:w-auto sm:max-w-[20rem] rounded-full border border-line bg-surface py-2 pl-3 pr-8 text-sm font-semibold text-fg focus-visible:outline-2 focus-visible:outline-accent"
        >
          <option value="">{own ? `Trip time · ${zoneLabel(own, at)}` : "Trip time"}</option>
          {places.length > 0 && <optgroup label="Places in this trip">{places.map(option)}</optgroup>}
          {!zones.includes(deviceTz) && <optgroup label="This device">{option(deviceTz)}</optgroup>}
          {others.length > 0 && <optgroup label="All time zones">{others.map(option)}</optgroup>}
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
      </span>
    </div>
  );
}
