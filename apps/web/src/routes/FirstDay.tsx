import { localDate, parseInviteToken } from "@hoppin/core";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useServices } from "../app/services";
import { useSignOut } from "../app/useSignOut";
import { Button } from "../components/ui/Button";
import { SpiderCursor as SilkSpiderCursor } from "../components/ui/SpiderCursor";
import { inputClass } from "../lib/forms";

const OPTIONS = [
  { k: "Days", d: "The plan, one day at a time." },
  { k: "Money", d: "Who paid, and the fewest transfers." },
  { k: "Docs", d: "Tickets and addresses, saved on the phone." },
  { k: "Today", d: "What's on right now, and what comes next." },
];

function dayLabel(date: string): { weekday: string; rest: string } {
  const at = new Date(`${date}T12:00:00Z`);
  const fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...options }).format(at);
  return { weekday: fmt({ weekday: "long" }), rest: fmt({ day: "numeric", month: "long" }) };
}

/** The first screen after the invite, before any trip exists. Laid out like a day. */
export function FirstDay({ online, onStart, onJoin }: { online: boolean; onStart: () => void; onJoin: (token: string) => void }) {
  const { clock } = useServices();
  const signOut = useSignOut();
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const today = dayLabel(localDate(clock.now(), clock.timeZone));

  function join(event: FormEvent) {
    event.preventDefault();
    const token = parseInviteToken(link);
    if (!token) {
      setError("That doesn't look like an invite link. Ask the organizer to send you theirs.");
      return;
    }
    onJoin(token);
  }

  return (
    <main className="first-day">
      <style>{FIRST_DAY_CSS}</style>
      <header className="first-day-bar">
        <span data-silk-anchor>hoppin</span>
        <Link to="/account" aria-label="Account">
          Account
        </Link>
      </header>

      <p className="first-day-kicker">{today.weekday}</p>
      <h1 className="first-day-title" data-silk-anchor>
        Welcome to Hoppin
      </h1>
      <p className="first-day-lede" data-silk-anchor>
        You're in. This first day is empty on purpose. Start a trip, or join one with an invite, and the rest of Hoppin opens up.
      </p>
      <p className="first-day-date" data-silk-anchor>
        {today.rest}
      </p>

      <div className="first-day-actions">
        <article className="first-day-card" data-silk-anchor>
          <h2>Start a trip</h2>
          <p>You become the organizer. The dates can wait.</p>
          <Button disabled={!online} onClick={onStart}>
            Start a trip
          </Button>
          {!online && <p className="first-day-hint">Connect to the internet to create a trip.</p>}
        </article>
        <article className="first-day-card" data-silk-anchor>
          <h2>Join a trip</h2>
          <p>Paste the invite link an organizer sent you.</p>
          <form onSubmit={join} className="first-day-form">
            <label className="first-day-label">
              Invite link
              <input className={inputClass} value={link} onChange={(event) => setLink(event.target.value)} autoComplete="off" />
            </label>
            {error && <p className="first-day-hint">{error}</p>}
            <Button type="submit">Join the trip</Button>
          </form>
        </article>
      </div>

      <ul className="first-day-options">
        {OPTIONS.map((option) => (
          <li key={option.k} data-silk-anchor>
            <strong>{option.k}</strong>
            <span>{option.d}</span>
          </li>
        ))}
      </ul>

      <button type="button" className="first-day-out" onClick={() => void signOut()}>
        Sign out
      </button>
      <SilkSpiderCursor bounceColor="#0d22ee" shadowColor="#000a3a" silkColor="#f6f3ec" seedWebs={8} />
    </main>
  );
}

const FIRST_DAY_CSS = `
.first-day { position: relative; min-height: 100svh; padding: 28px clamp(16px, 4vw, 48px) 64px; background: #0d22ee; color: #f6f3ec; overflow-x: clip;
  font-family: "Helvetica Neue", "Neue Haas Grotesk Text", Inter, Arial, system-ui, sans-serif; }
.first-day-bar { display: flex; align-items: center; justify-content: space-between; font-size: 22px; font-weight: 500; letter-spacing: -0.03em; }
.first-day-bar a { color: #f6f3ec; font-size: 15px; font-weight: 600; text-decoration: none; }
.first-day-kicker { margin: 36px 0 0; font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: #d5defa; }
.first-day-title { margin: 6px 0 0; max-width: 16ch; font-size: clamp(52px, 8vw, 88px); line-height: 0.88; font-weight: 500; letter-spacing: -0.06em; }
.first-day-lede { margin: 16px 0 0; max-width: 38rem; font-size: 18px; font-weight: 300; line-height: 1.45; color: rgba(246,243,236,0.9); }
.first-day-date { margin: 10px 0 0; font-family: Georgia, "Times New Roman", serif; font-style: italic; font-size: 22px; }
.first-day-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; max-width: 760px; margin-top: 28px; }
.first-day-card { padding: 20px; border-radius: 20px; background: #f6f3ec; color: #101428; box-shadow: 0 24px 50px -18px rgba(0,4,60,0.55); }
.first-day-card h2 { margin: 0; font-size: 28px; font-weight: 500; letter-spacing: -0.04em; }
.first-day-card p { margin: 8px 0 14px; font-size: 15px; line-height: 1.4; }
.first-day-form { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; }
.first-day-label { display: flex; flex-direction: column; gap: 6px; width: 100%; font-size: 14px; font-weight: 600; }
.first-day-hint { margin: 0; font-size: 14px; }
.first-day-options { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; max-width: 760px; margin: 22px 0 0; padding: 0; list-style: none; }
.first-day-options li { display: flex; flex-direction: column; gap: 8px; min-height: 120px; padding: 16px; border-radius: 16px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.22); }
.first-day-options strong { font-size: 20px; font-weight: 500; letter-spacing: -0.03em; }
.first-day-options span { font-size: 13px; font-weight: 300; line-height: 1.4; color: rgba(246,243,236,0.86); }
.first-day-out { margin-top: 28px; padding: 0; border: 0; background: transparent; color: #f6f3ec; font: inherit; font-size: 15px; font-weight: 600; cursor: pointer; }
.first-day a:focus-visible, .first-day button:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
@media (max-width: 760px) {
  .first-day-actions, .first-day-options { grid-template-columns: 1fr; }
}
`;
