"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import "./landing.css";

/* the landing mock for Calendars: two tabs like the app's hub — ours (money + plans) and hers (cycle).
   Auto-flips every few seconds; tapping a tab pins it. */
function MkCalendars() {
  const [tab, setTab] = useState(0);
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    if (pinned) return;
    const t = setInterval(() => setTab((v) => 1 - v), 4200);
    return () => clearInterval(t);
  }, [pinned]);
  const pick = (i) => { setTab(i); setPinned(true); };
  const OURS = { dot: [3, 9, 14, 20, 24], pin: [5, 25], today: 17 };
  const HERS = { rose: [11, 12, 13], pred: [24, 25, 26, 27], fert: [17, 18, 19, 20], star: 19, today: 17 };
  return (
    <div className="mk mk-cals">
      <div className="mk-tabs" role="tablist" aria-label="two calendars">
        <button type="button" role="tab" aria-selected={tab === 0} className={tab === 0 ? "on" : ""} onClick={() => pick(0)}>📅 Our calendar</button>
        <button type="button" role="tab" aria-selected={tab === 1} className={tab === 1 ? "on" : ""} onClick={() => pick(1)}>🌸 Her cycle</button>
      </div>
      <div className="mk-cal-stack">
        <div className={"mk-cal ours" + (tab === 0 ? " show" : "")} aria-hidden={tab !== 0}>
          {Array.from({ length: 28 }).map((_, i) => (
            <span key={i} className={"d" + (OURS.dot.includes(i) ? " dot" : "") + (OURS.pin.includes(i) ? " pin" : "") + (i === OURS.today ? " today" : "")}>{i + 1}</span>
          ))}
        </div>
        <div className={"mk-cal hers" + (tab === 1 ? " show" : "")} aria-hidden={tab !== 1}>
          {Array.from({ length: 28 }).map((_, i) => (
            <span key={i} className={"d" + (HERS.rose.includes(i) ? " rose" : "") + (HERS.pred.includes(i) ? " pred" : "") + (HERS.fert.includes(i) ? " fert" : "") + (i === HERS.star ? " star" : "") + (i === HERS.today ? " today" : "")}>{i + 1}</span>
          ))}
        </div>
      </div>
      <div className="mk-cap">{tab === 0 ? "spending dots · 📌 plans, bills, birthdays" : "period · predicted · fertile window — hers, shared if she wants"}</div>
    </div>
  );
}

const FEATURES = [
  {
    key: "today", e: "🏠", name: "Today",
    line: "Log what you spend — it shows up on both phones.",
    body: "Tap ＋, type the amount, pick a category — ten seconds, and your partner sees it instantly. Plus a daily mood + photo check-in, a question of the day, and 💛 taps on each other's entries.",
    mock: (
      <div className="mk mk-today">
        <div className="mk-row"><span className="av you">H</span><b>Rs 500</b><span className="mk-tag">Food</span></div>
        <div className="mk-row"><span className="av him">Z</span><b>Rs 1,200</b><span className="mk-tag">Transport</span></div>
        <div className="mk-plus">＋</div>
      </div>
    ),
  },
  {
    key: "cal", e: "📅", name: "Calendars",
    line: "Two calendars — one for the two of you, one for her.",
    body: "Our Calendar keeps the money and the plans in one month view: what you spent each day, dates, bills, birthdays, trips. Her Cycle is a separate, gentle calendar — private to her unless she chooses to share it.",
    mock: <MkCalendars />,
  },
  {
    key: "notes", e: "📌", name: "Corkboard",
    line: "Remember the little things, so you never ask twice.",
    body: "Sticky notes and shared checklists for both of you: coffee orders, clothing sizes, the grocery run, our song, that restaurant you keep meaning to try.",
    mock: (
      <div className="mk mk-notes">
        <div className="stick a">oat latte, extra hot ☕</div>
        <div className="stick b">groceries<br/><s>eggs</s> · bread · <s>mangoes</s></div>
      </div>
    ),
  },
  {
    key: "goals", e: "🎯", name: "Goals",
    line: "Save toward things together, one jar at a time.",
    body: "Set a target — a trip, a sofa — and either of you drops money in. Watch the jar fill; 100% pops confetti. A bucket list for the dreams that aren't about money.",
    mock: (
      <div className="mk mk-goals">
        <div className="jar-col"><div className="jar"><div className="liquid" style={{ background: "var(--butter)", height: "68%" }} /><div className="pct lit">68%</div></div><span>Japan 🗼</span></div>
        <div className="jar-col"><div className="jar"><div className="liquid" style={{ background: "var(--sage)", height: "35%" }} /><div className="pct">35%</div></div><span>Sofa 🛋</span></div>
        <div className="jar-col"><div className="jar"><div className="liquid" style={{ background: "var(--peach)", height: "100%" }} /><div className="pct lit">100%</div></div><span>Oven 🎉</span></div>
      </div>
    ),
  },
  {
    key: "us", e: "💌", name: "Us",
    line: "Your story so far — and a letter every month.",
    body: "Totals since day one, who spent what, soft monthly caps — never a scoreboard. Each month Duo writes a recap letter from last month's entries, to open together. Every photo you kept lives next door in Memories, as a polaroid wall.",
    mock: (
      <div className="mk mk-us">
        <div className="env"><div className="flap" /><div className="letter">Dear us…</div></div>
      </div>
    ),
  },
];

export default function Landing() {
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    try { setTheme(localStorage.getItem("duo-theme") === "dark" ? "dark" : "light"); } catch {}
  }, []);

  useEffect(() => {
    const els = document.querySelectorAll(".ld .rv");
    if (!("IntersectionObserver" in window)) { els.forEach((el) => el.classList.add("in")); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { threshold: 0.18 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const flipTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("duo-theme", next); } catch {}
  };

  return (
    <div className="ld">
      {/* ambient background: two slow warm glows + a few tiny hearts drifting up. Pure CSS, decorative only. */}
      <div className="ld-sky" aria-hidden="true">
        <i className="glow g1" /><i className="glow g2" /><i className="glow g3" />
        {Array.from({ length: 9 }, (_, i) => <b key={i} className={"fh fh-" + (i + 1)}>{i % 3 === 2 ? "🤍" : "💛"}</b>)}
      </div>
      <header className="ld-top">
        <span className="wordmark">duo <span className="heart">💛</span></span>
        <div className="ld-top-r">
          <button className="theme-mini" onClick={flipTheme} aria-label="switch between light and dark">{theme === "dark" ? "☀️" : "🌙"}</button>
          <Link className="ld-signin" href="/login">Sign in</Link>
        </div>
      </header>

      <section className="ld-hero">
        <div className="ld-copy">
          <p className="eyebrow hi hi-1">for exactly two people</p>
          <h1 className="hi hi-2">A cozy little<br/>world <em>for two.</em></h1>
          <p className="lede hi hi-3">Every rupee, photo, note and jar either of you adds shows up on both phones. It talks like a kind friend and never keeps score between you.</p>
          <div className="hi hi-4 cta-row">
            <Link className="cta" href="/login">Get Duo 💛</Link>
            <span className="cta-sub">free · two phones · one shared world</span>
          </div>
        </div>

        <div className="desk hi hi-3" aria-hidden="true">
          <div className="phone phone-a">
            <div className="ph-head"><span className="av you">H</span><span>her phone</span></div>
            <div className="entry">
              {/* each phone shows what the other one added: hers has Z's entry (she taps 💛), his has H's */}
              <div className="en-top"><span className="av him">Z</span><span className="en-who"><b>Z</b> added</span><span className="en-time">just now</span></div>
              <div className="en-amt">Rs 800 <small>Food</small></div>
              <div className="en-like"><span className="hb">💛</span><span className="hl">You tapped 💛</span></div>
            </div>
          </div>
          <div className="phone phone-b">
            <div className="ph-head"><span className="av him">Z</span><span>his phone</span></div>
            <div className="entry ghost">
              <div className="en-top"><span className="av you">H</span><span className="en-who"><b>H</b> added</span><span className="en-time">just now</span></div>
              <div className="en-amt">Rs 500 <small>Food</small></div>
            </div>
            <div className="tap-hand">👆</div>
          </div>
          <div className="polaroid">
            <div className="pic">☕</div>
            <div className="cap">sunday, us</div>
          </div>
          <div className="jar-col desk-jar">
            <div className="jar">
              <div className="liquid grow" style={{ background: "var(--butter)" }} />
              <div className="pct pct-anim" />
            </div>
            <div className="conf"><i/><i/><i/><i/><i/><i/><i/><i/></div>
            <span>Japan 🗼</span>
          </div>
          <div className="sticky mini">don't forget: her size is M 💛</div>
        </div>
      </section>

      <section className="ld-feats">
        <p className="eyebrow rv">what's inside</p>
        <h2 className="rv">One house, eight little rooms — here are five.</h2>
        <div className="feat-list">
          {FEATURES.map((f, i) => (
            <article key={f.key} className={"feat rv" + (i % 2 ? " flip" : "")} style={{ "--i": i }}>
              <div className="feat-txt">
                <div className="feat-e">{f.e}</div>
                <h3>{f.name}</h3>
                <p className="feat-line">{f.line}</p>
                <p className="feat-body">{f.body}</p>
              </div>
              <div className="feat-mock">{f.mock}</div>
            </article>
          ))}
        </div>
      </section>

      <section className="ld-rule rv">
        <div className="sticky rule">
          <span className="pin" />
          🕊 <b>The no-fight rule.</b><br/>
          Duo shows facts about <i>us</i>, never accusations about <i>you</i>.<br/>
          No red. No alarms. Ever.
        </div>
      </section>

      <section className="ld-end rv">
        <h2>Two phones. One little world.</h2>
        <Link className="cta" href="/login">Get Duo 💛</Link>
        <p className="ld-foot">made for exactly two people · no ads, no feed of strangers</p>
      </section>
    </div>
  );
}
