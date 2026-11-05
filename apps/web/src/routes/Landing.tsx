import { MapPin } from "lucide-react";
import { Link } from "react-router";
import SilkSpiderCursor from "../components/ui/silk-spider-cursor";
import "./landing.css";

// Public front door for Hoppin. The spider and its silk live on a layer behind
// the content; anything marked data-silk-anchor is a place the silk may stick.

const COAST = "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=500&q=80";
const ROAD = "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=700&q=80";

const CHAT = [
  { by: "Aman", text: "wait what time is the kayak thing?" },
  { by: "Riya", text: "sent a photo · IMG_4821.jpg" },
  { me: true, text: "which hotel are we in again" },
  { by: "Kabir", text: "who paid for the boat?? I think I did" },
  { by: "Neha", text: "can someone resend the train ticket pls" },
  { me: true, text: "scrolling up since 20 mins 😭" },
];

const PAINS = [
  { icon: "💬", t: "Plans buried in chat", d: "Times, links and addresses scroll away the moment someone sends a meme." },
  { icon: "🎫", t: "Tickets in 12 screenshots", d: "Nobody can find the booking when the guard, gate or hotel desk asks for it." },
  { icon: "💸", t: "“Who owes whom?”", d: "Expenses pile up, memory fades, and someone ends up quietly out of pocket." },
  { icon: "📵", t: "No signal, no plan", d: "The one moment you need the address is the moment the network drops." },
];

const BEFORE = [
  "Plans spread across chat, notes and email",
  "Tickets hunted down at the gate",
  "Expenses tracked in someone's head",
  "Everyone asks the same three questions daily",
];
const AFTER = [
  "One timeline per day, visible to everyone",
  "Every booking and document one tap away",
  "Costs split automatically, fewest transfers",
  "“Now and next” answers the questions for you",
];

const STEPS = [
  { t: "Start a trip", d: "Name it, pick the dates, add the places. Takes about a minute." },
  { t: "Invite the group", d: "Share one link. Friends join and see the plan straight away." },
  { t: "Travel light", d: "Plans, tickets and costs stay in sync, on and offline." },
];

function appHref() {
  return import.meta.env.VITE_DEMO === "true" ? "/trips/demo-goa/today" : "/sign-in";
}

function OpenCta({ line, to, label }: { line: string; to: string; label: string }) {
  return (
    <div className="lp-sec-cta" data-silk-anchor>
      <span>{line}</span>
      <Link className="lp-btn" to={to}>
        {label} →
      </Link>
    </div>
  );
}

export default function Landing() {
  const enter = appHref();
  const demo = import.meta.env.VITE_DEMO === "true";
  const label = demo ? "Open the sample trip" : "Open Hoppin";

  return (
    <main className="lp-root" id="top">
      <header className="lp-nav">
        <a className="lp-logo" href="#top">
          <MapPin aria-hidden="true" size={20} strokeWidth={1.8} />
          hoppin
        </a>
        <nav className="lp-links" aria-label="Primary">
          <a href="#pain">the problem</a>
          <a href="#features">features</a>
          <a href="#how">how it works</a>
          <Link className="lp-btn" to={enter}>
            join
          </Link>
        </nav>
      </header>

      {/* HERO */}
      <section className="lp-hero">
        <div className="lp-wrap lp-hero-grid">
          <div>
            <p className="lp-eyebrow">for group trips</p>
            <h1 data-silk-anchor>
              Plan together.
              <br />
              <em>Stop chasing</em> the chat.
            </h1>
            <p className="lp-lede" data-silk-anchor>
              Itinerary, bookings, tickets and who paid. One shared place for everyone on the trip, working even when the signal isn't.
            </p>
            <div className="lp-cta-row">
              <Link className="lp-btn" to={enter} data-silk-anchor>
                {label} →
              </Link>
              <a className="lp-btn lp-ghost" href="#features" data-silk-anchor>
                See how it works
              </a>
            </div>
            <p className="lp-hint-silk">
              <kbd>del</kbd> sweeps the webs
            </p>
            <div className="lp-proof">
              <div>
                <b>1 place</b>for every plan
              </div>
              <div>
                <b>0 chats</b>to scroll back through
              </div>
              <div>
                <b>Fewest</b>transfers to settle up
              </div>
            </div>
          </div>

          <div className="lp-stage" aria-hidden="true">
            <img className="lp-photo lp-s-coast" alt="" src={COAST} width={500} height={667} data-silk-anchor />
            <div className="lp-glass lp-now" data-silk-anchor>
              <div className="lp-row">
                <div className="lp-sw" />
                <div>
                  <b>now and next</b>
                  <small>Goa · sunset kayaking</small>
                </div>
              </div>
              <div className="lp-bar">
                <i />
              </div>
              <div className="lp-small">DAY 3 · 5:30 PM &nbsp;·&nbsp; Riya booked it</div>
            </div>
            <div className="lp-ticket" data-silk-anchor>
              <div className="lp-m">
                <span>GROUP PASS</span>
                <span>No. 6E 123</span>
              </div>
              <div className="lp-t">
                the coast,
                <br />
                open all week
              </div>
              <div className="lp-m">
                <span>row everyone</span>
                <span>seat whichever</span>
              </div>
            </div>
            <img className="lp-photo lp-s-road" alt="" src={ROAD} width={700} height={525} data-silk-anchor />
          </div>
        </div>
      </section>

      {/* PAIN POINTS */}
      <section className="lp-pain" id="pain">
        <div className="lp-wrap">
          <div className="lp-head">
            <div>
              <p className="lp-eyebrow">sound familiar?</p>
              <h2 data-silk-anchor>Group trips break in the group chat.</h2>
            </div>
            <p className="lp-lede">The trip itself is the easy part. Keeping eight people on the same page is where it falls apart.</p>
          </div>
          <div className="lp-pain-grid">
            <div className="lp-chat" role="img" aria-label="A chaotic group chat" data-silk-anchor>
              <div className="lp-top">
                <span>Goa 2026 🌴🌴 (11)</span>
                <span>248 unread</span>
              </div>
              {CHAT.map((m, i) => (
                <div key={i} className={m.me ? "lp-msg lp-me" : "lp-msg"}>
                  {m.by ? <u>{m.by}</u> : null}
                  {m.text}
                </div>
              ))}
              <div className="lp-more">↑ 248 messages between you and the booking</div>
            </div>
            <div className="lp-pains">
              {PAINS.map((p) => (
                <div key={p.t} className="lp-pain-card" data-silk-anchor>
                  <div className="lp-ico" aria-hidden="true">
                    {p.icon}
                  </div>
                  <div>
                    <h3>{p.t}</h3>
                    <p>{p.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <OpenCta line="Tired of scrolling up for the booking?" to={enter} label={label} />
        </div>
      </section>

      {/* BEFORE / AFTER */}
      <section style={{ paddingBottom: 0 }}>
        <div className="lp-wrap">
          <p className="lp-eyebrow">the difference</p>
          <h2 style={{ marginBottom: 40 }} data-silk-anchor>
            From scattered to settled.
          </h2>
          <div className="lp-ba">
            <div className="lp-before" data-silk-anchor>
              <h3>Without Hoppin</h3>
              <ul>
                {BEFORE.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
            <div className="lp-after" data-silk-anchor>
              <h3>With Hoppin</h3>
              <ul>
                {AFTER.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          </div>
          <OpenCta line="Ready to go from scattered to settled?" to={enter} label={label} />
        </div>
      </section>

      {/* FEATURES */}
      <section id="features">
        <div className="lp-wrap">
          <p className="lp-eyebrow">what you get</p>
          <h2 style={{ marginBottom: 24 }} data-silk-anchor>
            Everything the group needs, nothing it doesn't.
          </h2>

          <div className="lp-feat">
            <div className="lp-copy">
              <span className="lp-tag">Days</span>
              <h2 data-silk-anchor>The plan, without the chat.</h2>
              <p className="lp-lede">Each day is a clean timeline. Flights and stays are solid blocks. Optional plans stay small until someone opts in.</p>
              <ul className="lp-checks">
                <li>Everyone sees the same day, live</li>
                <li>Mark plans as fixed or optional</li>
                <li>“Now and next” on the Today screen</li>
              </ul>
            </div>
            <div className="lp-mock" aria-hidden="true" data-silk-anchor>
              <div className="lp-bar-t">
                <span>Day 3 · Goa</span>
                <span>Sat 14 Mar</span>
              </div>
              <div className="lp-slot">
                <time>9:00</time>
                <div>
                  <b>Breakfast at the cafe</b>
                  <small>Anjuna · everyone</small>
                </div>
                <span className="lp-chip lp-opt">optional</span>
              </div>
              <div className="lp-slot">
                <time>12:30</time>
                <div>
                  <b>Check in · Sea View Resort</b>
                  <small>Booking #HP-2291</small>
                </div>
                <span className="lp-chip lp-solid">booked</span>
              </div>
              <div className="lp-slot">
                <time>17:30</time>
                <div>
                  <b>Sunset kayaking</b>
                  <small>Riya booked it · 6 going</small>
                </div>
                <span className="lp-chip">going</span>
              </div>
            </div>
          </div>

          <div className="lp-feat lp-flip">
            <div className="lp-copy">
              <span className="lp-tag">Money</span>
              <h2 data-silk-anchor>Who paid, and who owes.</h2>
              <p className="lp-lede">Add the boat, the stay, lunch for eight. Hoppin works out the fewest transfers so everyone settles in minutes.</p>
              <ul className="lp-checks">
                <li>Split evenly or by custom share</li>
                <li>Balances update as you add</li>
                <li>Fewest payments to settle up</li>
              </ul>
            </div>
            <div className="lp-mock" aria-hidden="true" data-silk-anchor>
              <div className="lp-bar-t">
                <span>Settle up</span>
                <span>8 people</span>
              </div>
              <div className="lp-big-total">₹48,600</div>
              <div className="lp-small" style={{ opacity: 0.6 }}>
                total trip spend
              </div>
              <div className="lp-owe">
                <span className="lp-who">
                  <span className="lp-av" style={{ background: "#0d22ee" }}>K</span>Kabir → Riya
                </span>
                <span className="lp-amt">₹2,400</span>
              </div>
              <div className="lp-owe">
                <span className="lp-who">
                  <span className="lp-av" style={{ background: "#e0457b" }}>N</span>Neha → Riya
                </span>
                <span className="lp-amt">₹1,150</span>
              </div>
              <div className="lp-owe">
                <span className="lp-who">
                  <span className="lp-av" style={{ background: "#14a37f" }}>A</span>Aman → Kabir
                </span>
                <span className="lp-amt">₹800</span>
              </div>
            </div>
          </div>

          <div className="lp-feat">
            <div className="lp-copy">
              <span className="lp-tag">Docs &amp; offline</span>
              <h2 data-silk-anchor>Still there when the signal isn't.</h2>
              <p className="lp-lede">Tickets, addresses and the day's stops live on the phone. Edits wait offline, then sync the moment you reconnect.</p>
              <ul className="lp-checks">
                <li>Upload tickets and IDs once</li>
                <li>Works on a train, a boat, a hill</li>
                <li>Nothing lost, edits sync later</li>
              </ul>
            </div>
            <div className="lp-mock" aria-hidden="true" data-silk-anchor>
              <div className="lp-bar-t">
                <span>Documents</span>
                <span>5 files</span>
              </div>
              <div className="lp-doc">
                <i>PDF</i>
                <div>
                  <b>Train ticket · Mumbai → Madgaon</b>
                  <div className="lp-small">Added by Neha</div>
                </div>
              </div>
              <div className="lp-doc">
                <i>PDF</i>
                <div>
                  <b>Sea View Resort · confirmation</b>
                  <div className="lp-small">Added by Aman</div>
                </div>
              </div>
              <div className="lp-doc">
                <i>IMG</i>
                <div>
                  <b>Kayak voucher</b>
                  <div className="lp-small">Added by Riya</div>
                </div>
              </div>
              <span className="lp-offline">Offline · everything saved on this phone</span>
            </div>
          </div>
          <OpenCta line="Everything the group needs, in one place." to={enter} label={label} />
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" style={{ paddingTop: 0 }}>
        <div className="lp-wrap">
          <p className="lp-eyebrow">how it works</p>
          <h2 data-silk-anchor>Three steps. No sign-up wall for your friends.</h2>
          <div className="lp-steps">
            {STEPS.map((s) => (
              <div key={s.t} className="lp-step" data-silk-anchor>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </div>
            ))}
          </div>
          <OpenCta line="Start your first trip in a minute." to={enter} label={label} />
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="lp-final" id="join">
        <div className="lp-wrap">
          <p className="lp-eyebrow">ready when you are</p>
          <h2 data-silk-anchor>Your next trip, in one place.</h2>
          <p className="lp-lede">Free for groups. Start the trip, send the link, and let the chat go back to memes.</p>
          <div className="lp-cta-row">
            <Link className="lp-btn" to={enter} data-silk-anchor>
              {label} →
            </Link>
            <a className="lp-btn lp-ghost" href="#features" data-silk-anchor>
              See what's inside
            </a>
          </div>
        </div>
      </section>

      <footer>
        <div className="lp-wrap">
          <span>hoppin · one shared place for the group trip</span>
          <span>2026</span>
        </div>
      </footer>

      <SilkSpiderCursor bounceColor="#0d22ee" shadowColor="#000a3a" seedWebs={16} zIndex={1} />
    </main>
  );
}
