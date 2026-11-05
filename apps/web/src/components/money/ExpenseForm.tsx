import {
  EXPENSE_CATEGORIES,
  convertMinor,
  minorDigits,
  minorToText,
  parseMinor,
  splitAmount,
  validateExpenseDraft,
  type ExpenseCategory,
  type ExpenseDraftErrors,
  type ExpenseRecord,
  type ExpenseShare,
} from "@hoppin/core";
import { Check, ChevronDown, ChevronLeft, ChevronRight, CloudOff, Info, Trash2, UserPlus } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { MoneyPerson } from "../../app/people";
import { useOnline } from "../../hooks/useOnline";
import { cn } from "../../lib/cn";
import { formatShortDate } from "../../lib/dates";
import { inputClass } from "../../lib/forms";
import { currencyName, currencySymbol, formatMoneyShort, formatRate } from "../../lib/money";
import { useRate } from "../../lib/money-view";
import { CurrencyPicker } from "../HomeCurrencyCard";
import { Button } from "../ui/Button";
import { CATEGORY_ICON, CATEGORY_LABEL } from "./categories";
import { GuestTag, PersonDot } from "./PersonDot";

export interface ExpenseFormValues {
  amount: number;
  currency: string;
  title: string;
  category: ExpenseCategory;
  paidBy: string;
  split: ExpenseShare[];
  spentOn: string;
}

export interface ExpenseFormProps {
  /** The expense being edited; leave out to add one. */
  initial?: ExpenseRecord;
  /** Who can pay or share, in the order to show them (members, then guests). */
  people: MoneyPerson[];
  viewerId: string;
  defaultCurrency: string;
  /** The person's own currency, to show what a bill comes to as they type. */
  previewCurrency: string | null;
  /** Currencies the trip already uses, listed first in the picker. */
  pinnedCurrencies: readonly string[];
  today: string;
  onSubmit: (values: ExpenseFormValues) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
  /** Adds a guest and returns their id. */
  onAddGuest: (name: string) => Promise<string>;
}

const labelOf = (p: MoneyPerson, viewerId: string) => (p.id === viewerId ? "You" : p.name);

/** Whether a horizontal list has more people off the left or the right edge. */
export function payerScrollEnds(scrollLeft: number, clientWidth: number, scrollWidth: number): { left: boolean; right: boolean } {
  return {
    left: scrollLeft > 4,
    right: scrollLeft + clientWidth < scrollWidth - 4,
  };
}

/** The people who might have paid, kept inside the card. A long list scrolls, with a chevron when more names are hidden. */
function PayerStrip({ children }: { children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [ends, setEnds] = useState({ left: false, right: false });

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () => setEnds(payerScrollEnds(el.scrollLeft, el.clientWidth, el.scrollWidth));
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [children]);

  const nudge = (direction: -1 | 1) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.max(140, el.clientWidth * 0.7), behavior: "smooth" });
  };

  // Same height as a payer chip (min-h-12), so the arrow sits on the person icon.
  const chevron = "inline-flex h-12 w-8 shrink-0 items-center justify-center rounded-full text-fg focus-visible:outline-2 focus-visible:outline-accent";

  return (
    <div className="flex min-w-0 items-center">
      {ends.left && (
        <button type="button" aria-label="Earlier people" onClick={() => nudge(-1)} className={chevron}>
          <ChevronLeft aria-hidden="true" className="size-5" />
        </button>
      )}
      <div ref={scroller} data-payer-strip className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
      {ends.right && (
        <button type="button" aria-label="More people" onClick={() => nudge(1)} className={chevron}>
          <ChevronRight aria-hidden="true" className="size-5" />
        </button>
      )}
    </div>
  );
}

/** Add or change an expense: how much (in any currency), what for, who paid, and who shares it. */
export function ExpenseForm({ initial, people, viewerId, defaultCurrency, previewCurrency, pinnedCurrencies, today, onSubmit, onCancel, onDelete, onAddGuest }: ExpenseFormProps) {
  const online = useOnline();
  const exactStart = initial?.split.some((s) => s.share !== undefined) ?? false;
  const [currency, setCurrency] = useState(initial?.currency ?? defaultCurrency);
  const [amountText, setAmountText] = useState(initial ? minorToText(initial.amount, initial.currency) : "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [category, setCategory] = useState<ExpenseCategory>(initial && initial.category !== "payment" ? initial.category : "food");
  const [paidBy, setPaidBy] = useState(initial?.paidBy ?? viewerId);
  const [mode, setMode] = useState<"equal" | "exact">(exactStart ? "exact" : "equal");
  const [included, setIncluded] = useState<ReadonlySet<string>>(
    new Set(initial ? initial.split.map((s) => s.who) : people.filter((p) => !p.guest).map((p) => p.id)),
  );
  const [exact, setExact] = useState<Record<string, string>>(
    exactStart && initial ? Object.fromEntries(initial.split.map((s) => [s.who, minorToText(s.share ?? 0, initial.currency)])) : {},
  );
  const [spentOn, setSpentOn] = useState(initial?.spentOn ?? today);
  const [errors, setErrors] = useState<ExpenseDraftErrors>({});
  const [picking, setPicking] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestError, setGuestError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const ids = { amount: useId(), title: useId(), payer: useId(), split: useId(), date: useId(), guest: useId(), rate: useId() };

  const amount = parseMinor(amountText, currency);
  const chosen = people.filter((p) => included.has(p.id)).map((p) => p.id);
  const money = (minor: number) => formatMoneyShort(minor, currency);

  const toggle = (id: string) => {
    setIncluded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setErrors((e) => ({ ...e, split: undefined }));
  };

  const chooseMode = (next: "equal" | "exact") => {
    setMode(next);
    setErrors((e) => ({ ...e, split: undefined }));
    // Exact amounts start from the equal split, so people only change the parts that differ.
    if (next === "exact" && amount && chosen.length > 0 && chosen.every((id) => !exact[id])) {
      const parts = splitAmount(amount, chosen.map((who) => ({ who })));
      setExact(Object.fromEntries(chosen.map((id) => [id, minorToText(parts[id] ?? 0, currency)])));
    }
  };

  async function addGuest() {
    const name = guestName.trim();
    if (!name) return setGuestError("Type their name.");
    if (people.some((p) => p.name.trim().toLowerCase() === name.toLowerCase())) return setGuestError(`There's already someone called ${name}.`);
    try {
      const id = await onAddGuest(name);
      setIncluded((current) => new Set([...current, id]));
      setGuestOpen(false);
      setGuestName("");
      setGuestError(null);
    } catch (error) {
      setGuestError(error instanceof Error ? error.message : "Couldn't add the guest. Please try again.");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = validateExpenseDraft({ amountText, currency, title, mode, people: chosen, exact });
    if (!result.ok) {
      setErrors(result.errors);
      const first = result.errors.amount ? ids.amount : result.errors.title ? ids.title : ids.split;
      document.getElementById(first)?.scrollIntoView?.({ block: "center", behavior: "smooth" });
      document.getElementById(first)?.focus({ preventScroll: true });
      return;
    }
    setErrors({});
    setSaving(true);
    setFailed(null);
    try {
      await onSubmit({ amount: result.amount, currency, title: title.trim(), category, paidBy, split: result.split, spentOn });
    } catch {
      setFailed("Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const amountError = errors.amount === "missing" ? "Type how much it cost." : errors.amount === "invalid" ? (minorDigits(currency) === 0 ? `Use whole numbers for ${currency}.` : "Use numbers only, like 1250 or 1250.50.") : null;
  const splitError = !errors.split
    ? null
    : errors.split.code === "nobody"
      ? "Pick at least one person to share it."
      : errors.split.code === "zero"
        ? "Give someone a part of it."
        : errors.split.code === "short"
          ? `Share out ${money(errors.split.by)} more so it adds up.`
          : `That's ${money(errors.split.by)} more than the bill.`;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.amount} className="text-sm font-semibold">
          How much?
        </label>
        <div className={cn("flex items-center gap-2 rounded-3xl bg-raised p-2 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-accent", amountError && "ring-2 ring-danger-fg")}>
          <button
            type="button"
            onClick={() => setPicking(true)}
            aria-haspopup="dialog"
            aria-label={`Currency: ${currencyName(currency)}. Change`}
            className="inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-full bg-surface py-1 pl-1.5 pr-3 font-bold shadow-card focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full bg-accent-soft font-display text-xs text-accent-soft-fg">
              {currencySymbol(currency)}
            </span>
            {currency}
            <ChevronDown aria-hidden="true" className="size-4" />
          </button>
          <input
            id={ids.amount}
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="next"
            placeholder="0"
            value={amountText}
            aria-invalid={amountError ? true : undefined}
            aria-describedby={`${ids.amount}-preview${amountError ? ` ${ids.amount}-error` : ""}`}
            onChange={(e) => {
              setAmountText(e.target.value);
              setErrors((x) => ({ ...x, amount: undefined }));
            }}
            className="min-w-0 flex-1 bg-transparent px-1 font-display text-4xl font-bold tracking-tight text-fg outline-none placeholder:text-muted/50"
          />
        </div>
        <Preview
          id={`${ids.amount}-preview`}
          amount={amount}
          currency={currency}
          target={previewCurrency}
          rateOpen={rateOpen}
          rateId={ids.rate}
          onToggleRate={() => setRateOpen((v) => !v)}
        />
        {amountError && (
          <span id={`${ids.amount}-error`} className="text-sm text-danger-fg">
            {amountError}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.title} className="text-sm font-semibold">
          What for?
        </label>
        <input
          id={ids.title}
          maxLength={80}
          placeholder="Dinner, taxi, tickets…"
          value={title}
          aria-invalid={errors.title ? true : undefined}
          onChange={(e) => {
            setTitle(e.target.value);
            setErrors((x) => ({ ...x, title: undefined }));
          }}
          className={`${inputClass} font-display text-lg font-bold`}
        />
        {errors.title && <span className="text-sm text-danger-fg">What was it for? A word or two is enough.</span>}
        <div role="radiogroup" aria-label="Kind of expense" className="mt-1 flex flex-wrap gap-2">
          {EXPENSE_CATEGORIES.map((c) => {
            const Icon = CATEGORY_ICON[c];
            return (
              <Pill key={c} name="category" checked={category === c} onChange={() => setCategory(c)}>
                <Icon aria-hidden="true" className="size-4" />
                {CATEGORY_LABEL[c]}
              </Pill>
            );
          })}
        </div>
      </div>

      <fieldset className="flex min-w-0 flex-col gap-1.5">
        <legend id={ids.payer} className="mb-1.5 text-sm font-semibold">
          Who paid?
        </legend>
        <PayerStrip>
          {people.map((p) => (
            <label
              key={p.id}
              className="flex min-h-12 shrink-0 cursor-pointer items-center gap-2 rounded-full bg-raised py-1 pl-1.5 pr-4 text-sm font-semibold transition-colors has-[:checked]:bg-accent has-[:checked]:text-accent-fg has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
            >
              <input type="radio" name="paid-by" className="sr-only" checked={paidBy === p.id} onChange={() => setPaidBy(p.id)} />
              <PersonDot person={p} size="sm" />
              {labelOf(p, viewerId)}
              {p.guest && <GuestTag />}
            </label>
          ))}
        </PayerStrip>
      </fieldset>

      <fieldset id={ids.split} tabIndex={-1} className="flex flex-col gap-2 outline-none">
        <legend className="mb-1.5 text-sm font-semibold">Split between</legend>
        <div role="radiogroup" aria-label="How to split" className="grid grid-cols-2 gap-1 rounded-full bg-raised p-1">
          {(["equal", "exact"] as const).map((m) => (
            <label
              key={m}
              className="flex min-h-10 cursor-pointer items-center justify-center rounded-full text-sm font-semibold text-muted transition-colors has-[:checked]:bg-surface has-[:checked]:text-fg has-[:checked]:shadow-card has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
            >
              <input type="radio" name="split-mode" className="sr-only" checked={mode === m} onChange={() => chooseMode(m)} />
              {m === "equal" ? "Equally" : "Exact amounts"}
            </label>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted">{mode === "equal" ? "Tap people to add or remove them." : `Type each person's part in ${currency}.`}</span>
          <button
            type="button"
            onClick={() => setIncluded(included.size === people.length ? new Set() : new Set(people.map((p) => p.id)))}
            className="min-h-9 shrink-0 rounded-full px-2 text-sm font-semibold text-link focus-visible:outline-2 focus-visible:outline-accent"
          >
            {included.size === people.length ? "Clear" : "Everyone"}
          </button>
        </div>
        <div role="group" aria-label="People sharing it" className="grid grid-cols-4 gap-1.5">
          {people.map((p) => (
            <label
              key={p.id}
              className="group flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl px-1 py-2.5 text-xs font-semibold text-muted transition-colors hover:bg-raised has-[:checked]:text-fg has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
            >
              <input type="checkbox" className="sr-only" checked={included.has(p.id)} onChange={() => toggle(p.id)} />
              <span className="relative">
                <PersonDot person={p} size="lg" className="scale-90 opacity-35 transition-all duration-300 group-has-[:checked]:scale-100 group-has-[:checked]:opacity-100" />
                <span aria-hidden="true" className="absolute -bottom-1 -right-1 hidden size-5 items-center justify-center rounded-full bg-accent text-accent-fg ring-2 ring-surface group-has-[:checked]:flex">
                  <Check className="size-3" />
                </span>
              </span>
              <span className="max-w-full truncate">{labelOf(p, viewerId)}</span>
              {p.guest && <GuestTag />}
            </label>
          ))}
          <button
            type="button"
            onClick={() => setGuestOpen(true)}
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-line px-1 py-2.5 text-xs font-semibold hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span className="flex size-12 items-center justify-center rounded-full bg-raised">
              <UserPlus aria-hidden="true" className="size-5" />
            </span>
            Add guest
          </button>
        </div>

        {guestOpen && (
          <div className="flex flex-col gap-1.5 rounded-2xl bg-raised p-3">
            <label htmlFor={ids.guest} className="text-sm font-semibold">
              Guest's name
            </label>
            <div className="flex gap-2">
              <input
                id={ids.guest}
                autoFocus
                maxLength={40}
                autoComplete="off"
                placeholder="Mia, Diya's daughter"
                value={guestName}
                onChange={(e) => {
                  setGuestName(e.target.value);
                  setGuestError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  void addGuest();
                }}
                className={cn(inputClass, "bg-surface")}
              />
              <Button variant="secondary" className="bg-surface" onClick={() => void addGuest()}>
                Add
              </Button>
            </div>
            <span className="text-xs text-muted">For people without the app, like a kid or a partner. Everyone in the trip can see guests.</span>
            {guestError && <span className="text-sm text-danger-fg">{guestError}</span>}
          </div>
        )}

        {mode === "exact" && chosen.length > 0 && (
          <div className="flex flex-col gap-2">
            {people
              .filter((p) => included.has(p.id))
              .map((p) => (
                <div key={p.id} className="flex items-center gap-3">
                  <PersonDot person={p} size="sm" />
                  <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-semibold">
                    <span className="truncate">{labelOf(p, viewerId)}</span>
                    {p.guest && <GuestTag />}
                  </span>
                  <input
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0"
                    aria-label={`${labelOf(p, viewerId)}'s part in ${currency}`}
                    value={exact[p.id] ?? ""}
                    onChange={(e) => {
                      setExact((x) => ({ ...x, [p.id]: e.target.value }));
                      setErrors((x) => ({ ...x, split: undefined }));
                    }}
                    className={cn(inputClass, "w-36 text-right font-semibold")}
                  />
                </div>
              ))}
          </div>
        )}
        <SplitSummary mode={mode} amount={amount} currency={currency} people={chosen} exact={exact} />
        {splitError && <span className="text-sm text-danger-fg">{splitError}</span>}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.date} className="text-sm font-semibold">
          When
        </label>
        <input id={ids.date} type="date" value={spentOn} onChange={(e) => e.target.value && setSpentOn(e.target.value)} className={inputClass} />
        <span className="text-xs text-muted">We use that day's exchange rate.</span>
      </div>

      {onDelete &&
        (confirmDelete ? (
          <div role="alert" className="flex flex-col gap-3 rounded-2xl bg-danger-bg p-4 text-sm text-danger-fg">
            <p>
              <b>Delete "{initial?.title}"?</b> Everyone's balances update. You can undo it right after.
            </p>
            <div className="flex gap-2">
              <Button className="bg-danger-fg text-danger-bg" onClick={onDelete}>
                <Trash2 aria-hidden="true" className="size-4" />
                Delete it
              </Button>
              <Button variant="ghost" className="text-danger-fg" onClick={() => setConfirmDelete(false)}>
                Keep it
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" className="self-start text-danger-fg" onClick={() => setConfirmDelete(true)}>
            <Trash2 aria-hidden="true" className="size-4" />
            Delete expense
          </Button>
        ))}

      {!online && (
        <p role="status" className="flex items-start gap-2 rounded-2xl bg-info-bg px-4 py-2.5 text-sm font-medium text-info-fg">
          <CloudOff aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          You're offline. This is saved on your phone and sent when you're back online.
        </p>
      )}
      {failed && (
        <p role="alert" className="text-sm text-danger-fg">
          {failed}
        </p>
      )}
      <div className="sticky bottom-0 z-20 -mx-5 flex gap-2 border-t border-line bg-surface px-5 pb-1 pt-3">
        <Button type="submit" disabled={saving} className="flex-1">
          {initial ? "Save changes" : "Add expense"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      <CurrencyPicker
        open={picking}
        onOpenChange={setPicking}
        value={currency}
        allowOff={false}
        pinned={pinnedCurrencies}
        title="Currency on the bill"
        description="Pick the money the bill was in. We convert it for everyone."
        onPick={(c) => {
          if (!c) return;
          setCurrency(c);
          setRateOpen(false);
          setErrors((x) => ({ ...x, amount: undefined }));
          if (mode === "exact") setExact({});
        }}
      />
    </form>
  );
}

function Pill({ name, checked, onChange, children }: { name: string; checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-raised px-4 text-sm font-semibold transition-colors has-[:checked]:bg-accent has-[:checked]:text-accent-fg has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent">
      <input type="radio" name={name} className="sr-only" checked={checked} onChange={onChange} />
      {children}
    </label>
  );
}

interface PreviewProps {
  id: string;
  amount: number | null;
  currency: string;
  target: string | null;
  rateOpen: boolean;
  rateId: string;
  onToggleRate: () => void;
}

/** What the bill comes to in the person's own currency, live as they type, with the rate one tap away. */
function Preview({ id, amount, currency, target, rateOpen, rateId, onToggleRate }: PreviewProps) {
  const converting = target && target !== currency ? target : null;
  const quote = useRate(converting ? currency : null, converting);
  const typed = amount !== null && amount > 0;
  let line: ReactNode;
  if (!typed) line = converting ? `Type the amount in ${currency}. We'll show it in ${converting} too.` : "Type what was paid, in the currency on the bill.";
  else if (!converting) line = `${formatMoneyShort(amount, currency)}. Everyone else sees it in their own currency.`;
  else if (quote === undefined) line = `${formatMoneyShort(amount, currency)} · working out ${converting}…`;
  else if (quote === null) line = `${formatMoneyShort(amount, currency)} · no rate on this phone yet. It's added when you're back online.`;
  else
    line = (
      <>
        {formatMoneyShort(amount, currency)} is <b className="text-fg">≈ {formatMoneyShort(convertMinor(amount, quote.rate, currency, converting), converting)}</b> in your currency
        {quote.old && <span className="block text-xs">Using a rate saved on {formatShortDate(quote.date)}. It's updated when you're back online.</span>}
      </>
    );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-6 items-start gap-2 text-sm text-muted">
        {typed && converting && quote && (
          <button
            type="button"
            onClick={onToggleRate}
            aria-expanded={rateOpen}
            aria-controls={rateId}
            aria-label="Show the exchange rate used"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-raised text-fg focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Info aria-hidden="true" className="size-4" />
          </button>
        )}
        <span id={id} aria-live="polite" className={cn(typed && converting && quote && "pt-1")}>
          {line}
        </span>
      </div>
      {rateOpen && converting && quote && (
        <div id={rateId} className="rounded-2xl bg-raised px-4 py-3 text-sm">
          <b>
            1 {currency} = {formatRate(quote.rate, converting)}
          </b>
          <span className="block text-muted">
            {quote.old ? `Rate saved on this phone on ${formatShortDate(quote.date)}.` : `European Central Bank rate, ${formatShortDate(quote.date)}.`} When you save, the rate is stored with the
            bill, so what people owe never changes later.
          </span>
        </div>
      )}
    </div>
  );
}

function SplitSummary({ mode, amount, currency, people, exact }: { mode: "equal" | "exact"; amount: number | null; currency: string; people: string[]; exact: Record<string, string> }) {
  const base = "flex items-center justify-between gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold";
  const n = people.length;
  if (n === 0) return null;
  if (!amount) return <p className={cn(base, "bg-raised")}>{mode === "equal" ? `${n} ${n === 1 ? "person shares" : "people share"} it equally` : "Type the total first"}</p>;
  if (mode === "equal") {
    const parts = Object.values(splitAmount(amount, people.map((who) => ({ who }))));
    const low = Math.min(...parts);
    return (
      <p className={cn(base, "bg-accent-soft text-accent-soft-fg")}>
        <span>
          {formatMoneyShort(low, currency)} each · {n} {n === 1 ? "person" : "people"}
        </span>
        {Math.max(...parts) !== low && <span className="text-xs font-medium">a few pay a tiny bit more</span>}
      </p>
    );
  }
  const sum = people.reduce((total, who) => total + (parseMinor(exact[who] ?? "", currency) ?? 0), 0);
  if (sum === amount)
    return (
      <p className={cn(base, "justify-start bg-accent-soft text-accent-soft-fg")}>
        <Check aria-hidden="true" className="size-4" />
        Adds up to {formatMoneyShort(amount, currency)}
      </p>
    );
  return (
    <p className={cn(base, "bg-warn-bg text-warn-fg")}>
      <span>{sum < amount ? `${formatMoneyShort(amount - sum, currency)} left to share out` : `${formatMoneyShort(sum - amount, currency)} too much`}</span>
      <span className="text-xs font-medium">of {formatMoneyShort(amount, currency)}</span>
    </p>
  );
}
