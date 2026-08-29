"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import "./landing.css";

const FEATURES = [
  {
    key: "today", e: "🏠", name: "Today",
    line: "Tap ＋, type 500, tap Food, done.",
    body: "Ten seconds to add anything. A daily photo + mood, a question of the day, and 💛 taps on each other's entries.",
    mock: (
      <div className="mk mk-today">
        <div className="mk-row"><span className="av you">H</span><b>₨500</b><span className="mk-tag">Food</span></div>
        <div className="mk-row"><span className="av him">Z</span><b>₨1,200</b><span className="mk-tag">Petrol</span></div>
        <div className="mk-plus">＋</div>
      </div>
    ),
  },
  {
    key: "cal", e: "📅", name: "Calendar",
    line: "The Sunday scroll, together.",
    body: "Spending dots, plans, bills, birthdays — one month, both of you. Her cycle calendar lives here too, shared if she wants.",
    mock: (
      <div className="mk mk-cal">
        {Array.from({ length: 28 }).map((_, i) => (
          <span key={i} className={"d" + ([3, 9, 14, 20, 24].includes(i) ? " dot" : "") + ([11, 12, 13].includes(i) ? " rose" : "") + (i === 17 ? " today" : "")}>{i + 1}</span>
        ))}
      </div>
    ),
  },
  {
    key: "notes", e: "📌", name: "Corkboard",
    line: "Forget-me-nots, pinned.",
    body: "Sticky notes and shared lists you both tick off. Coffee orders, sizes, our song, that restaurant.",
    mock: (
      <div className="mk mk-notes">
        <div className="stick a">oat latte, extra hot ☕</div>
        <div className="stick b">groceries<br/><s>eggs</s> · bread · <s>mangoes</s></div>
      </div>
    ),
  },
  {
    key: "goals", e: "🎯", name: "Goals",
    line: "Jars that fill up.",
    body: "Either of you drops money in; 100% = confetti. A bucket list for the dreams that aren't about money.",
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
    line: "Open the envelope on the 1st.",
    body: "A monthly letter about the two of you. Saved together since day one. Memories as a polaroid wall.",
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
              <div className="en-top"><span className="av you">H</span><span className="en-who"><b>H</b> added</span><span className="en-time">just now</span></div>
              <div className="en-amt">₨500 <small>Food</small></div>
              <div className="en-like"><span className="hb">💛</span><span className="hl">Z tapped 💛</span></div>
            </div>
          </div>
          <div className="phone phone-b">
            <div className="ph-head"><span className="av him">Z</span><span>his phone</span></div>
            <div className="entry ghost">
              <div className="en-top"><span className="av you">H</span><span className="en-who"><b>H</b> added</span><span className="en-time">just now</span></div>
              <div className="en-amt">₨500 <small>Food</small></div>
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
        <h2 className="rv">Five rooms, one house.</h2>
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
