import { ArrowDown, Heart, MapPin, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import SilkSpiderCursor from "../components/ui/silk-spider-cursor";

// A public front door for Hoppin, in the same collage as the silk spider.
// Anything marked data-silk-anchor is a place the silk may stick.

const NAV = [
  { href: "#plan", label: "days" },
  { href: "#plan", label: "bookings" },
  { href: "#plan", label: "money" },
  { href: "#plan", label: "docs" },
  { href: "#today", label: "today" },
];

const MOMENTS = [
  { place: "Goa", title: "sunset kayaking", when: "day 3 · 5:30pm", by: "Riya booked it", hue: 18 },
  { place: "Manali", title: "the overnight bus", when: "day 1 · 9:00pm", by: "window seats, both sides", hue: 200 },
  { place: "Fort Aguada", title: "morning at the fort", when: "day 4 · 10:00am", by: "tickets are in docs", hue: 32 },
];

const SHELF = [
  { k: "days", t: "the plan, without the group chat", d: "Each day is a timeline. Flights and stays are solid blocks. Optional plans stay small until someone taps them." },
  { k: "money", t: "who paid, and the fewest transfers", d: "The boat, the stay, lunch for eight. Hoppin works out who owes whom." },
  { k: "offline", t: "still there when the signal isn't", d: "Tickets, addresses and the day's stops live on the phone. Edits wait, then sync." },
];

const COAST = "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=700&q=80";
const ROAD = "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=900&q=80";
const FLATLAY = "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=600&q=80";

function appHref() {
  return import.meta.env.VITE_DEMO === "true" ? "/trips/demo-goa/today" : "/sign-in";
}

export default function Landing() {
  const enter = appHref();
  const enterLabel = import.meta.env.VITE_DEMO === "true" ? "Open the sample trip" : "Open Hoppin";

  return (
    <main className="hp-root">
      <style>{HP_CSS}</style>

      <header className="hp-nav">
        <a className="hp-logo" href="#top" data-silk-anchor>
          <MapPin aria-hidden="true" size={22} strokeWidth={1.7} />
          hoppin
        </a>
        <nav className="hp-links">
          {NAV.map((item, i) => (
            <a key={item.label} href={item.href} data-silk-anchor className={i === 0 ? "hp-here" : undefined}>
              {item.label}
            </a>
          ))}
          <Link to={enter} data-silk-anchor>
            join
          </Link>
        </nav>
      </header>

      <section className="hp-hero" id="top">
        <h1 className="hp-word" aria-label="hoppin">
          {"hoppin".split("").map((letter, i) => (
            <span key={i} data-silk-anchor>
              {letter}
            </span>
          ))}
        </h1>

        <img
          className="hp-coast"
          src={COAST}
          alt="A bright tropical beach, the kind of coast a group trip ends up on"
          data-silk-anchor
          width={700}
          height={467}
        />
        <Today />

        <div className="hp-copy">
          <h2 data-silk-anchor>
            one place
            <br />
            for the group
          </h2>
          <p data-silk-anchor>Itinerary, bookings, documents and who paid. Nobody has to chase the chat.</p>
          <p className="hp-hint">
            <kbd>del</kbd> sweeps the webs
          </p>
          <Link className="hp-open" to={enter} data-silk-anchor>
            {enterLabel}
          </Link>
        </div>

        <div className="hp-road-wrap">
          <ArrowDown className="hp-arrow" aria-hidden="true" size={34} strokeWidth={1.7} />
          <img
            className="hp-road"
            src={ROAD}
            alt="A van on an open road, packed for a long drive"
            data-silk-anchor
            width={900}
            height={600}
          />
        </div>

        <div className="hp-ticket" data-silk-anchor>
          <div className="hp-ticket-top">
            <span>GROUP PASS</span>
            <span>No. 6E 123</span>
          </div>
          <div className="hp-ticket-title">
            the coast,
            <br />
            open all week
          </div>
          <div className="hp-ticket-foot">
            <span>row everyone</span>
            <span>seat whichever</span>
          </div>
        </div>
        <img
          className="hp-flatlay"
          src={FLATLAY}
          alt="A camera, a map and a notebook laid out for a trip"
          data-silk-anchor
          width={600}
          height={600}
        />
        <div className="hp-note" data-silk-anchor>
          <span className="hp-pin" />
          <b>todo</b>
          <s>ask where we're staying</s>
          <s>chase the visas</s>
          <span>stop screenshotting tickets</span>
        </div>
      </section>

      <section className="hp-shelf" id="plan">
        <h3 data-silk-anchor>what the group actually needs</h3>
        <div className="hp-cards">
          {SHELF.map((card) => (
            <article key={card.k} className="hp-card" data-silk-anchor>
              <span className="hp-card-k">{card.k}</span>
              <h4>{card.t}</h4>
              <p>{card.d}</p>
            </article>
          ))}
        </div>
        <footer className="hp-foot" data-silk-anchor>
          <span>hoppin · one shared place for the group trip</span>
          <span>2026</span>
        </footer>
      </section>

      <SilkSpiderCursor bounceColor="#0d22ee" shadowColor="#000a3a" seedWebs={14} zIndex={50} />
    </main>
  );
}

function Today() {
  const [playing, setPlaying] = useState(false);
  const [index, setIndex] = useState(0);
  const [liked, setLiked] = useState(false);
  const moment = MOMENTS[index]!;

  const skip = (dir: number) => {
    setIndex((index + dir + MOMENTS.length) % MOMENTS.length);
  };

  return (
    <div className="hp-today" id="today" data-silk-anchor>
      <div className="hp-today-top">
        <div
          className="hp-swatch"
          style={{
            background: `radial-gradient(circle at 70% 30%, hsl(${moment.hue + 30} 95% 75%) 0 14%, transparent 15%), linear-gradient(150deg, hsl(${moment.hue} 90% 60%), hsl(${moment.hue + 40} 70% 22%))`,
          }}
        />
        <div className="hp-today-meta">
          <b>now and next</b>
          <span>
            {moment.place} · {moment.title}
          </span>
        </div>
        <button type="button" className={liked ? "hp-heart on" : "hp-heart"} aria-label={liked ? "Unlike" : "Like"} aria-pressed={liked} onClick={() => setLiked(!liked)}>
          <Heart aria-hidden="true" size={16} fill={liked ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="hp-bar">
        <span className={playing ? "hp-fill run" : "hp-fill"} key={index} />
      </div>
      <div className="hp-today-row">
        <span className={playing ? "hp-live on" : "hp-live"}>
          <i />
          {moment.when}
        </span>
        <span className="hp-station">
          {index + 1} / {MOMENTS.length}
        </span>
      </div>
      <p className="hp-by">{moment.by}</p>
      <div className="hp-controls">
        <button type="button" aria-label="Previous stop" onClick={() => skip(-1)}>
          <SkipBack aria-hidden="true" size={18} />
        </button>
        <button type="button" className="hp-play" aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying(!playing)}>
          {playing ? <Pause aria-hidden="true" size={18} fill="currentColor" /> : <Play aria-hidden="true" size={18} fill="currentColor" />}
        </button>
        <button type="button" aria-label="Next stop" onClick={() => skip(1)}>
          <SkipForward aria-hidden="true" size={18} />
        </button>
      </div>
    </div>
  );
}

const HP_CSS = `
.hp-root { position: relative; min-height: 100svh; background: #0d22ee; color: #f6f3ec; overflow-x: clip;
  font-family: "Helvetica Neue", "Neue Haas Grotesk Text", Inter, Arial, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
.hp-root a { color: inherit; text-decoration: none; }
.hp-root img { max-width: none; object-fit: cover; }
.hp-nav { position: relative; z-index: 3; display: flex; align-items: center; justify-content: space-between; padding: 26px clamp(16px, 4.5vw, 64px) 0; }
.hp-logo { display: inline-flex; align-items: center; gap: 8px; font-size: 22px; font-weight: 500; letter-spacing: -0.03em; }
.hp-links { display: flex; gap: clamp(14px, 2.4vw, 38px); font-size: 16px; font-weight: 300; letter-spacing: -0.01em; }
.hp-links a { opacity: 0.92; }
.hp-links a:hover { opacity: 1; }
.hp-here { text-decoration: line-through !important; text-decoration-thickness: 1.5px !important; }
.hp-hero { position: relative; height: max(100svh, 820px); margin-top: -64px; }
.hp-word { position: absolute; left: 50%; top: 4%; transform: translateX(-50%); margin: 0; font-size: min(42vw, 78svh); line-height: 0.82; font-weight: 500; letter-spacing: -0.07em; white-space: nowrap; color: #f4f1ea; user-select: none; }
.hp-word span { display: inline-block; }
.hp-coast { position: absolute; left: 14%; top: 36%; width: clamp(96px, 10vw, 150px); height: auto; aspect-ratio: 3 / 4; border-radius: 18px; transform: rotate(-9deg); filter: drop-shadow(10px 18px 14px rgba(0, 6, 60, 0.45)); z-index: 2; }
.hp-today { position: absolute; left: 4.5%; top: 48%; width: clamp(250px, 21vw, 300px); padding: 14px 16px 12px; border-radius: 18px; z-index: 2;
  background: linear-gradient(160deg, rgba(255,255,255,0.26), rgba(255,255,255,0.08)); border: 1px solid rgba(255,255,255,0.35);
  backdrop-filter: blur(16px) saturate(1.4); -webkit-backdrop-filter: blur(16px) saturate(1.4);
  box-shadow: 0 24px 50px -18px rgba(0, 4, 60, 0.6), inset 0 1px 0 rgba(255,255,255,0.4); transform: rotate(1.2deg); }
.hp-today-top { display: flex; align-items: center; gap: 10px; }
.hp-swatch { width: 38px; height: 38px; border-radius: 8px; flex: none; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.25); }
.hp-today-meta { display: flex; flex-direction: column; min-width: 0; flex: 1; line-height: 1.25; }
.hp-today-meta b { font-size: 14px; font-weight: 600; letter-spacing: -0.01em; }
.hp-today-meta span { font-size: 11.5px; opacity: 0.75; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hp-root button { all: unset; cursor: pointer; display: inline-grid; place-items: center; color: #fff; }
.hp-root button:focus-visible, .hp-root a:focus-visible { outline: 2px solid #fff; outline-offset: 3px; border-radius: 999px; }
.hp-heart { opacity: 0.85; }
.hp-heart.on { color: #ff6b8b; opacity: 1; }
.hp-bar { margin-top: 12px; height: 3px; border-radius: 3px; background: rgba(255,255,255,0.22); overflow: hidden; }
.hp-fill { display: block; height: 100%; width: 34%; background: #fff; border-radius: 3px; }
.hp-fill.run { animation: hp-prog 28s linear infinite; }
@keyframes hp-prog { from { width: 0% } to { width: 100% } }
.hp-today-row { display: flex; justify-content: space-between; margin-top: 7px; font-size: 10.5px; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.85; }
.hp-live { display: inline-flex; align-items: center; gap: 6px; }
.hp-live i { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,0.5); }
.hp-live.on i { background: #ff3b47; box-shadow: 0 0 0 0 rgba(255,59,71,0.6); animation: hp-live 1.6s ease-out infinite; }
@keyframes hp-live { 0% { box-shadow: 0 0 0 0 rgba(255,59,71,0.6) } 100% { box-shadow: 0 0 0 8px rgba(255,59,71,0) } }
.hp-by { margin: 6px 0 0; font-size: 12px; font-weight: 300; opacity: 0.8; }
.hp-controls { display: flex; justify-content: center; align-items: center; gap: 26px; margin-top: 8px; }
.hp-controls button { width: 30px; height: 30px; border-radius: 50%; opacity: 0.9; }
.hp-controls .hp-play { width: 40px; height: 40px; background: #fff; color: #0d22ee; opacity: 1; box-shadow: 0 6px 16px -6px rgba(0,0,40,0.5); }
.hp-copy { position: absolute; left: 4.5%; bottom: 4.5%; z-index: 2; max-width: 42vw; }
.hp-copy h2 { margin: 0; display: inline-block; font-size: clamp(44px, 5.6vw, 92px); line-height: 0.92; font-weight: 500; letter-spacing: -0.055em; }
.hp-copy p { margin: 18px 0 0; font-size: clamp(14px, 1.15vw, 18px); font-weight: 300; opacity: 0.9; letter-spacing: -0.01em; }
.hp-open { display: inline-flex; margin-top: 18px; padding: 10px 18px; border-radius: 999px; background: #f6f3ec; color: #0d22ee !important; font-size: 15px; font-weight: 600; letter-spacing: -0.02em; }
.hp-road-wrap { position: absolute; left: 50%; bottom: -2%; transform: translateX(-18%); display: flex; flex-direction: column; align-items: center; z-index: 2; }
.hp-arrow { margin-bottom: 8px; color: #fff; }
.hp-road { width: clamp(160px, 16vw, 240px); height: auto; aspect-ratio: 4 / 3; border-radius: 16px; transform: rotate(-4deg); filter: drop-shadow(8px 16px 14px rgba(0, 6, 60, 0.42)); }
.hp-ticket { position: absolute; right: 6%; top: 46%; width: 220px; padding: 14px 16px; z-index: 2; color: #2a2116; background: #f5ecd8; border-radius: 6px; transform: rotate(7deg);
  box-shadow: 0 22px 40px -16px rgba(0,4,60,0.6); background-image: radial-gradient(circle at 0 50%, #0d22ee 9px, transparent 10px), radial-gradient(circle at 100% 50%, #0d22ee 9px, transparent 10px);
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
.hp-ticket-top, .hp-ticket-foot { display: flex; justify-content: space-between; font-size: 10px; letter-spacing: 0.12em; opacity: 0.8; }
.hp-ticket-title { margin: 12px 0; padding: 10px 0; border-top: 1.5px dashed rgba(42,33,22,0.4); border-bottom: 1.5px dashed rgba(42,33,22,0.4); font-family: Georgia, "Times New Roman", serif; font-style: italic; font-size: 24px; line-height: 1.05; letter-spacing: -0.02em; }
.hp-flatlay { position: absolute; right: 22%; top: 64%; width: clamp(90px, 8.5vw, 128px); height: auto; aspect-ratio: 1; border-radius: 12px; transform: rotate(-12deg); filter: drop-shadow(4px 8px 6px rgba(0, 6, 60, 0.4)); z-index: 2; }
.hp-note { position: absolute; right: 4%; bottom: 7%; width: 210px; padding: 22px 18px 16px; display: flex; flex-direction: column; gap: 6px; z-index: 2;
  background: #fff7a8; color: #2b2a1a; transform: rotate(-3deg); box-shadow: 0 18px 30px -14px rgba(0,4,60,0.55);
  font-family: "Ink Free", "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive; font-size: 16px; }
.hp-note b { font-size: 20px; }
.hp-note s { opacity: 0.55; }
.hp-pin { position: absolute; top: -8px; left: 50%; width: 16px; height: 16px; margin-left: -8px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #ff8b8b, #c0141e); box-shadow: 0 3px 4px rgba(0,0,0,0.35); }
.hp-hint { margin: 22px 0 0; font-size: 12px; letter-spacing: 0.04em; opacity: 0.75; z-index: 2; white-space: nowrap; }
.hp-hint kbd { display: inline-block; padding: 2px 7px; margin-right: 4px; border: 1px solid rgba(255,255,255,0.55); border-bottom-width: 2px; border-radius: 5px; font: inherit; font-size: 11px; }
.hp-shelf { position: relative; padding: 120px clamp(16px, 4.5vw, 64px) 40px; z-index: 2; }
.hp-shelf h3 { display: inline-block; margin: 0 0 32px; font-size: clamp(30px, 3.4vw, 54px); font-weight: 500; letter-spacing: -0.05em; }
.hp-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: clamp(14px, 2vw, 28px); }
.hp-card { padding: 22px 22px 26px; border-radius: 16px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.22); }
.hp-card-k { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.7; }
.hp-card h4 { margin: 34px 0 10px; font-size: 24px; font-weight: 500; letter-spacing: -0.035em; line-height: 1.05; }
.hp-card p { margin: 0; font-size: 14px; font-weight: 300; opacity: 0.85; line-height: 1.45; }
.hp-foot { display: flex; justify-content: space-between; gap: 16px; margin-top: 90px; padding-top: 18px; border-top: 1px solid rgba(255,255,255,0.25); font-size: 13px; font-weight: 300; opacity: 0.85; }
@media (max-width: 760px) {
  .hp-links { display: none; }
  .hp-hero { height: max(100svh, 760px); }
  .hp-word { top: 12%; font-size: 22vw; }
  .hp-coast { left: 8%; top: 16%; width: 82px; }
  .hp-today { left: 5%; top: 40%; width: 220px; }
  .hp-copy { max-width: 90vw; bottom: 16%; }
  .hp-road-wrap { left: 50%; transform: translateX(-50%); bottom: -2%; }
  .hp-road { width: 120px; }
  .hp-ticket { right: -8%; top: 24%; width: 170px; transform: rotate(9deg) scale(0.78); }
  .hp-flatlay { right: 6%; top: 46%; width: 74px; }
  .hp-note, .hp-hint { display: none; }
  .hp-cards { grid-template-columns: 1fr; }
  .hp-foot { flex-direction: column; }
}
@media (prefers-reduced-motion: reduce) {
  .hp-fill.run, .hp-live.on i { animation: none; }
}
`;
