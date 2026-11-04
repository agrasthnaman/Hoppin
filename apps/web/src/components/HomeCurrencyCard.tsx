import { minorDigits } from "@hoppin/core";
import { Check, ChevronRight, Coins, Search } from "lucide-react";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { useHomeCurrency } from "../app/home-currency";
import { useServices } from "../app/services";
import { cn } from "../lib/cn";
import { formatShortDate } from "../lib/dates";
import { inputClass } from "../lib/forms";
import { currencyName, currencySymbol, formatMoney } from "../lib/money";
import { convert, RATE_CURRENCIES, type RateQuote } from "../providers/rates";
import { Card } from "./ui/Card";
import { Sheet } from "./ui/Sheet";

/** The currency's sign in a round badge; long signs (CHF, R$) get smaller type so they fit. */
function Badge({ children, className }: { children: ReactNode; className?: string }) {
  const long = typeof children === "string" && children.length > 2;
  return (
    <span
      aria-hidden="true"
      className={cn("flex size-10 shrink-0 items-center justify-center rounded-full font-display font-bold", long ? "text-xs" : "text-base", className)}
    >
      {children}
    </span>
  );
}

/** Choose the currency to see amounts in. Remembered on this device; display only, stored amounts never change. */
export function HomeCurrencyCard() {
  const [home, setHome] = useHomeCurrency();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const valueId = useId();

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 id={titleId} className="font-display text-lg font-bold">
          Home currency
        </h3>
        <p className="text-sm text-muted">See trip costs in money you know. What people entered never changes.</p>
      </div>

      <button
        type="button"
        aria-labelledby={`${titleId} ${valueId}`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="flex min-h-14 items-center gap-3 rounded-2xl bg-raised p-3 text-left transition-all hover:brightness-95 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Badge className="bg-accent-soft text-accent-soft-fg">{home ? currencySymbol(home) : <Coins className="size-5" />}</Badge>
        <span id={valueId} className="flex min-w-0 flex-col">
          <span className="truncate font-semibold">{home ? currencyName(home) : "Off"}</span>
          <span className="text-xs text-muted">{home ?? "Amounts show as entered"}</span>
        </span>
        <span aria-hidden="true" className="ml-auto flex items-center gap-0.5 text-sm font-semibold text-muted">
          Change
          <ChevronRight className="size-4" />
        </span>
      </button>

      {home && <RateLine home={home} />}

      <CurrencyPicker open={open} onOpenChange={setOpen} value={home} onPick={setHome} />
    </Card>
  );
}

/** "1 US Dollar ≈ ₹94.75", then where the rate is from; honest about saved or missing rates. */
function RateLine({ home }: { home: string }) {
  const { rates } = useServices();
  const from = home === "USD" ? "EUR" : "USD";
  const [result, setResult] = useState<{ home: string; quote: RateQuote | null } | null>(null);

  useEffect(() => {
    let live = true;
    rates.quote(from, home).then(
      (quote) => live && setResult({ home, quote }),
      () => live && setResult({ home, quote: null }),
    );
    return () => {
      live = false;
    };
  }, [rates, from, home]);

  const quote = result?.home === home ? result.quote : undefined;
  return (
    // Reserves its line while loading, so the card does not jump.
    <p role="status" className="min-h-10 px-1 text-sm text-muted">
      {quote === null && "Rates show up when you're online."}
      {quote && (
        <>
          <span className="font-semibold text-fg">{`1 ${currencyName(from)} ≈ ${formatMoney(convert(10 ** minorDigits(from), quote.rate, from, home), home)}`}</span>
          <span className="block text-xs">{quote.old ? `Saved rate from ${formatShortDate(quote.date)}` : `${rates.source} rate, ${formatShortDate(quote.date)}`}</span>
        </>
      )}
    </p>
  );
}

interface PickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string | null;
  onPick: (currency: string | null) => void;
}

function CurrencyPicker({ open, onOpenChange, value, onPick }: PickerProps) {
  const [query, setQuery] = useState("");
  const options = useMemo(
    () => RATE_CURRENCIES.map((code) => ({ code, name: currencyName(code), symbol: currencySymbol(code) })).sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );
  const q = query.trim().toLowerCase();
  const shown = q
    ? options.filter((o) => o.code.toLowerCase().includes(q) || o.name.toLowerCase().includes(q))
    : [...options].sort((a, b) => Number(b.code === value) - Number(a.code === value)); // current choice on top

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) setQuery("");
  };
  const choose = (currency: string | null) => () => {
    onPick(currency);
    close(false);
  };

  return (
    <Sheet open={open} onOpenChange={close} title="Home currency" description="Amounts in other currencies are also shown in this one.">
      <div className="flex flex-col gap-2">
        <label className="sticky top-0 z-10 -mx-1 block bg-surface px-1 pb-1">
          <span className="sr-only">Search currencies</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-5 top-3.5 size-5 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or code"
            autoComplete="off"
            enterKeyHint="search"
            className={cn(inputClass, "pl-12")}
          />
        </label>

        <div role="group" aria-label="Currencies" className="flex flex-col gap-1">
          {!q && <Option selected={value === null} onSelect={choose(null)} badge={<Coins className="size-5" />} title="Don't convert" hint="Show amounts as entered" />}
          {shown.map((o) => (
            <Option key={o.code} selected={value === o.code} onSelect={choose(o.code)} badge={o.symbol} title={o.name} hint={o.code} />
          ))}
          {shown.length === 0 && <p className="p-3 text-sm text-muted">No currency matches "{query.trim()}". Try its code, like EUR.</p>}
        </div>
      </div>
    </Sheet>
  );
}

interface OptionProps {
  selected: boolean;
  onSelect: () => void;
  badge: ReactNode;
  title: string;
  hint: string;
}

/** One choice. Tapping (or Enter/Space) picks it and closes the list, so choosing takes one step. */
function Option({ selected, onSelect, badge, title, hint }: OptionProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex min-h-14 w-full items-center gap-3 rounded-2xl p-2 pr-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        selected ? "bg-accent-soft text-accent-soft-fg" : "hover:bg-raised",
      )}
    >
      <Badge className={selected ? "bg-surface text-fg" : "bg-raised text-fg"}>{badge}</Badge>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-semibold">{title}</span>
        <span className={cn("text-xs", !selected && "text-muted")}>{hint}</span>
      </span>
      {selected && <Check aria-hidden="true" className="ml-auto size-5 shrink-0" />}
    </button>
  );
}
