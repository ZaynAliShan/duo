"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useDuo } from "./DuoProvider";

/* NUX — the first-time tour 💛: three paper cards, one guided first action (the ＋),
   then per-tab sticky-note coach marks. Max 2 nudges on day one; skippable everywhere. */
const KEY = "duo-nux-v2";
const CARDS = (p) => [
  { e: "💛", t: "Duo", b: "A little world for two — spending, plans, notes, and small celebrations, all on one cozy corkboard." },
  { e: "👀", t: "Everything here is shared", b: `What you log, ${p} sees. What ${p} logs, you see. That's not a setting — it's the whole point.` },
  { e: "🕊", t: "The no-fight rule", b: "Duo shows facts about us, never accusations about you. No red. No alarms. Ever." },
];
const TAB_COACH = (p) => ({
  feed: `Everything you two log lands here — yours and ${p}'s, woven together. Tap the 💛 on their entries; it's like texting back.`,
  goals: "Jars you fill together — 100% is confetti, non-negotiable. Dreams that aren't money live in the bucket list 🌈",
  mems: "Every moment you keep ends up on this wall. Month by month, it becomes your scrapbook 🎞",
  notes: "Leave a note, start a list, tick things off together. The forget-me-nots 🌸 remember what you should never have to ask twice.",
  cycle: "Her rhythm, shared with care. Duo tells you the phase and how to show up — no math, no judging, ever 🌸",
  cal: "Spending days, plans, countdowns — money-life and life-life on the same page. Tap any day for its story.",
  us: "The monthly picture — always about the two of you as a team, never a leaderboard. No red in here, ever.",
});
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { seenTabs: {} }; } catch { return { seenTabs: {} }; } };
const save = (n) => { try { localStorage.setItem(KEY, JSON.stringify(n)); } catch {} };

export default function NuxTour({ onAdd }) {
  const { partner, subscribe, me } = useDuo();
  const pathname = usePathname();
  const [nux, setNux] = useState(null);
  const [step, setStep] = useState(0);
  const [coach, setCoach] = useState(null); // {text, sel}
  const p = partner?.display_name || "your person";

  useEffect(() => { setNux(load()); }, []);
  useEffect(() => { if (!nux) return; save(nux); }, [nux]);
  const set = (patch) => setNux((n) => ({ ...n, ...patch }));

  // first entry → confetti toast
  useEffect(() => subscribe((ev) => {
    if (ev.table === "entries" && ev.type === "INSERT" && ev.new?.user_id === me?.id) {
      setNux((n) => (n && !n.firstEntry ? { ...n, firstEntry: true } : n));
      document.querySelectorAll(".nux-pulse").forEach((el) => el.classList.remove("nux-pulse"));
    }
  }), [subscribe, me?.id]);

  // per-tab coach marks, once each — marked seen when dismissed, not when scheduled
  useEffect(() => {
    if (!nux?.welcomed) return;
    const pane = pathname.slice(1).split("/")[0];
    const texts = TAB_COACH(p);
    if (texts[pane] && !nux.seenTabs?.[pane]) {
      const t = setTimeout(() => setCoach({ text: texts[pane], pane }), 380);
      return () => clearTimeout(t);
    }
  }, [pathname, nux?.welcomed, nux?.seenTabs]);

  // replay hook for Us
  useEffect(() => {
    const h = () => { setNux({ seenTabs: {} }); setStep(0); setCoach(null); window.scrollTo({ top: 0 }); };
    addEventListener("duo-nux-replay", h); return () => removeEventListener("duo-nux-replay", h);
  }, []);
  useEffect(() => {
    if (!nux || !nux.welcomed || nux.firstEntry) return;
    const fab = document.getElementById("fab"), side = document.getElementById("addSide");
    [fab, side].forEach((b) => b && b.classList.add("nux-pulse"));
    return () => [fab, side].forEach((b) => b && b.classList.remove("nux-pulse"));
  }, [nux?.welcomed, nux?.firstEntry]);

  if (!nux) return null;
  if (!nux.welcomed) {
    const cards = CARDS(p), c = cards[step];
    const finish = () => { set({ welcomed: true }); setTimeout(() => setCoach({ text: "Log anything — money or a moment. Under 10 seconds, promise ⏱", add: true }), 600); };
    return (
      <div className="nux-welcome">
        <div className="nux-wcard" key={step}>
          <div className="we">{c.e}</div><h3>{c.t}</h3><p>{c.b}</p>
          <div className="nux-dots">{cards.map((_, i) => <i key={i} className={i === step ? "on" : ""} />)}</div>
          <button className="nux-next" onClick={() => (step < cards.length - 1 ? setStep(step + 1) : finish())}>{step < cards.length - 1 ? "next →" : "let's go 💛"}</button>
          <button className="nux-skip" style={{ visibility: step < cards.length - 1 ? "visible" : "hidden" }} onClick={finish}>I'll figure it out →</button>
        </div>
      </div>
    );
  }
  if (coach) {
    return (
      <div className="nux-layer full show" onClick={() => {
        const add = coach.add, pane = coach.pane;
        if (pane) set({ seenTabs: { ...(nux.seenTabs || {}), [pane]: 1 } });
        setCoach(null); if (add) onAdd?.();
      }}>
        <div className="nux-note" style={{ top: "50%", left: "50%", transform: "translate(-50%,-50%) rotate(-2deg)" }}>
          {coach.text}<span className="nx-tip">tap anywhere to keep going</span>
        </div>
      </div>
    );
  }
  return null;
}
