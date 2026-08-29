"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { addMonths, format, getDay, getDaysInMonth, isAfter, startOfMonth } from "date-fns";
import { useDuo, useLive } from "@/components/DuoProvider";
import { fmt, fmtShort, dayKey, todayKey, fromKey, keyOf } from "@/lib/format";
import { copy } from "@/lib/copy";
import { buildModel, cycleInfo, PHASES } from "@/lib/cycle";
import { fetchCycle, useCycleOwner } from "@/lib/queries/cycle";

const DOWS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MARK_KINDS = [["bill", "💡"], ["trip", "🏔"], ["birthday", "🎂"], ["anniv", "💞"], ["other", "📌"]];
const ANNIV_LINES = ["another month of choosing each other 💛", "our day, big deal. happy monthiversary.", "the 9th never goes unnoticed around here 💞"];

export default function CalendarsPage() {
  const { view } = useParams();
  const router = useRouter();
  const v = view?.[0] || "hub";
  const { supabase, couple, tz } = useDuo();
  const today = todayKey(tz);
  const [d] = useLive(["entries", "goal_contributions", "goals", "calendar_marks", "notes", "cycles", "cycle_logs", "profiles"], async () => {
    if (!couple) return null;
    const [e, c, g, m, n, cyc] = await Promise.all([
      supabase.from("entries").select("*").eq("couple_id", couple.id).order("happened_at", { ascending: false }),
      supabase.from("goal_contributions").select("*").eq("couple_id", couple.id),
      supabase.from("goals").select("*").eq("couple_id", couple.id),
      supabase.from("calendar_marks").select("*").eq("couple_id", couple.id),
      supabase.from("notes").select("*").eq("couple_id", couple.id).not("pinned_day", "is", null),
      fetchCycle(supabase, couple.id),
    ]);
    return { entries: (e.data || []).map((x) => ({ ...x, k: dayKey(x.happened_at, tz) })), contribs: (c.data || []).map((x) => ({ ...x, k: dayKey(x.created_at, tz) })),
      goals: g.data || [], marks: m.data || [], notes: n.data || [], ...cyc };
  });
  useEffect(() => { window.scrollTo({ top: 0 }); }, [v]);
  if (!d) return <h2 className="pane-title">Our calendars 📅</h2>;
  if (v === "fin") return <Financial d={d} today={today} back={() => router.push("/cal")} />;
  if (v === "cycle") return <CycleCal d={d} today={today} back={() => router.push("/cal")} />;
  return <Hub d={d} today={today} go={(x) => router.push("/cal/" + x)} />;
}

function Hub({ d, today, go }) {
  const { partner, me } = useDuo();
  const m = today.slice(0, 7);
  const spent = d.entries.filter((e) => e.kind === "expense" && e.k.startsWith(m)).reduce((s, e) => s + Number(e.amount), 0);
  const adds = d.contribs.filter((c) => c.k.startsWith(m)).length;
  const own = useCycleOwner(d);
  const model = own?.rows.length ? buildModel(own.rows) : null;
  const info = model ? cycleInfo(fromKey(today), model) : null;
  return (
    <div>
      <h2 className="pane-title">Our calendars 📅</h2>
      <p className="pane-sub">Two rhythms, one home — pick a calendar.</p>
      <div className="hub-grid">
        <button className="hub-card" id="hubFinCard" onClick={() => go("fin")}>
          <span className="wm">💸</span><span className="hub-emoji">💸</span>
          <div className="hub-info">
            <div className="hub-name">Financial Calendar</div>
            <div className="hub-line"><b>{fmt(spent)}</b> spent in {format(fromKey(today), "MMMM")} · {adds} jar {adds === 1 ? "add" : "adds"}</div>
            <div className="hub-meta">spending dots · 🎯 jar adds · the little moments</div>
          </div><span className="hub-go">→</span>
        </button>
        <button className="hub-card" id="hubCycCard" onClick={() => go("cycle")}>
          <span className="wm">🌸</span><span className="hub-emoji">🌸</span>
          <div className="hub-info">
            <div className="hub-name">{own?.isMe ? "My" : "Her"} Cycle Calendar</div>
            <div className="hub-line">{info ? <><b>day {info.day} · {PHASES[info.phase].name.toLowerCase()} {PHASES[info.phase].e}</b> · period expected {format(model.nextStart, "MMM d")}</> : "nothing logged yet"}</div>
            <div className="hub-meta">period days · predictions · the fertile window</div>
          </div><span className="hub-go">→</span>
        </button>
      </div>
    </div>
  );
}

function useMonthGrid(today) {
  const [month, setMonthRaw] = useState(startOfMonth(fromKey(today)));
  const [sel, setSel] = useState(today);
  const lead = (getDay(month) + 6) % 7, days = getDaysInMonth(month);
  const T = fromKey(today);
  // navigating months moves the selection with you (same day-of-month, clamped) — a selection
  // from another month would show a wrong weekday and a false "quiet day"
  const setMonth = (m) => { setMonthRaw(m); setSel(keyOf(new Date(m.getFullYear(), m.getMonth(), Math.min(Number(sel.slice(8, 10)), getDaysInMonth(m))))); };
  return { month, setMonth, sel, setSel, lead, days, T, keyFor: (i) => keyOf(new Date(month.getFullYear(), month.getMonth(), i)) };
}

/** does a recurring date fall on day-key k? Day 29–31 marks land on the last day of shorter months. */
function recursHits(markDay, recurs, k) {
  if (recurs === "none") return markDay === k;
  if (markDay > k) return false;
  const dim = getDaysInMonth(fromKey(k));
  const dom = Number(markDay.slice(8, 10)), kd = Number(k.slice(8, 10));
  const hit = dom === kd || (kd === dim && dom > dim);
  if (recurs === "monthly") return hit;
  if (recurs === "yearly") return hit && markDay.slice(5, 7) === k.slice(5, 7);
  return false;
}

function Financial({ d, today, back }) {
  const { supabase, couple, me, who, letterOf, categories, nameOf } = useDuo();
  const g = useMonthGrid(today);
  const mk = format(g.month, "yyyy-MM");
  const byDay = useMemo(() => {
    const o = {};
    d.entries.filter((e) => e.k.startsWith(mk)).forEach((e) => { (o[e.k] = o[e.k] || { list: [], spent: 0, contribs: [] }).list.push(e); if (e.kind === "expense") o[e.k].spent += Number(e.amount); });
    d.contribs.filter((c) => c.k.startsWith(mk)).forEach((c) => { (o[c.k] = o[c.k] || { list: [], spent: 0, contribs: [] }).contribs.push(c); });
    return o;
  }, [d, mk]);
  const marksFor = (k) => d.marks.filter((m) => recursHits(m.day, m.recurs, k));
  const isAnnivDay = (k) => couple.anniversary ? recursHits(couple.anniversary, "monthly", k) : false;
  const max = Math.max(1, ...Object.values(byDay).map((x) => x.spent));
  const upto = mk === today.slice(0, 7) ? Number(today.slice(8)) : g.days;
  let busiest = 0, bd = 0, quiet = 0;
  for (let i = 1; i <= upto; i++) { const t = byDay[g.keyFor(i)]?.spent || 0; if (t > busiest) { busiest = t; bd = i; } if (!t) quiet++; }
  const moments = d.entries.filter((e) => e.kind === "moment" && e.k.startsWith(mk)).length;
  const jarAdds = d.contribs.filter((c) => c.k.startsWith(mk)).length;
  const selData = byDay[g.sel] || { list: [], spent: 0, contribs: [] };
  const selMarks = marksFor(g.sel);
  const selNotes = d.notes.filter((n) => n.pinned_day === g.sel);
  const selIsAnniv = isAnnivDay(g.sel);
  const selFuture = g.sel > today;
  const [adding, setAdding] = useState(false);
  const [mLabel, setMLabel] = useState(""); const [mKind, setMKind] = useState("other"); const [mRec, setMRec] = useState("none");
  async function addMark() {
    if (!mLabel.trim()) return;
    await supabase.from("calendar_marks").insert({ couple_id: couple.id, day: g.sel, label: mLabel.trim(), emoji: MARK_KINDS.find((k) => k[0] === mKind)[1], kind: mKind, recurs: mRec, created_by: me.id });
    setMLabel(""); setAdding(false);
  }
  function burst(el) {
    const r = el.getBoundingClientRect(); const em = ["💞", "💛", "💕", "✨", "💗", "💘", "🥰"];
    for (let i = 0; i < 7; i++) { const s = document.createElement("div"); s.className = "anniv-heart"; s.textContent = em[i];
      s.style.left = r.left + r.width / 2 - 10 + (Math.random() * 44 - 22) + "px"; s.style.top = r.top + r.height / 2 - 10 + "px";
      s.style.setProperty("--dx", Math.random() * 60 - 30 + "px"); s.style.setProperty("--rot", Math.random() * 40 - 20 + "deg"); s.style.animationDelay = i * 0.06 + "s"; s.style.fontSize = 15 + Math.random() * 9 + "px";
      document.body.appendChild(s); setTimeout(() => s.remove(), 1800); }
  }
  const catOf = (id) => categories.find((c) => c.id === id) || { emoji: "🌀", color: "#EDE7DE", name: "Other" };
  return (
    <div>
      <button className="gh-back" onClick={back}>← back to calendars</button>
      <h2 className="pane-title">Our month 📅</h2>
      <p className="pane-sub">Tap a day — dots are spending, 🎯 is jar savings, hearts are life.</p>
      <div className="cal-layout">
        <div className="cal-card">
          <div className="cal-head">
            <button onClick={() => g.setMonth(addMonths(g.month, -1))} aria-label="Previous month">‹</button>
            <div className="month">{format(g.month, "MMMM yyyy")}</div>
            <button onClick={() => g.setMonth(addMonths(g.month, 1))} aria-label="Next month">›</button>
          </div>
          <div className="cal-stats">
            <span className="cal-stat">🔥 busiest: <b>{bd ? format(g.month, "MMM") + " " + bd : "—"}</b></span>
            <span className="cal-stat">🌿 <b>{quiet}</b> quiet days</span><span className="cal-stat">✨ <b>{moments}</b> moments</span><span className="cal-stat">🎯 <b>{jarAdds}</b> jar adds</span>
          </div>
          <div className="dow"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div>
          <div className="grid">
            {Array.from({ length: g.lead }).map((_, i) => <button key={"b" + i} className="day other" />)}
            {Array.from({ length: g.days }).map((_, i) => {
              const k = g.keyFor(i + 1), x = byDay[k] || { list: [], spent: 0, contribs: [] }, mk2 = marksFor(k);
              const isToday = k === today, isAnniv = isAnnivDay(k);
              const future = k > today && !mk2.length && !isAnniv;
              const bg = x.spent > 0 && !isToday ? `color-mix(in srgb, var(--peach) ${Math.max(12, Math.round(Math.sqrt(x.spent / max) * 48))}%, transparent)` : undefined;
              const dots = [...x.list.map((e) => who(e.user_id)), ...x.contribs.map((c) => who(c.user_id))].slice(0, 3);
              return (
                <button key={k} className={"day" + (isToday ? " today-day" : "") + (isAnniv ? " anniv" : "") + (k === g.sel ? " sel" : "") + (future ? " future" : "")} style={{ background: bg }}
                  onClick={(e) => { if (isAnniv) burst(e.currentTarget); g.setSel(k); }}>
                  {isAnniv ? <span className="mark anniv-mark">💞</span> : mk2[0] ? <span className="mark">{mk2[0].emoji}</span> : null}
                  <span className="dnum">{i + 1}</span>
                  {x.spent > 0 ? <span className="damt">{fmtShort(x.spent)}{x.contribs.length ? <> <span className="dsave">🎯</span></> : null}</span>
                    : x.list.length ? <span className="damt">✨{x.contribs.length ? <> <span className="dsave">🎯</span></> : null}</span>
                    : x.contribs.length ? <span className="damt">🎯</span> : null}
                  <div className="dots">{dots.map((w, j) => <span key={j} className={"dot " + w} />)}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="day-panel">
          <div className="dp-head">
            <h4>{format(fromKey(g.sel), "EEEE")} · {format(fromKey(g.sel), "MMMM d")}
              {g.sel === today && <> <span className="dp-today">today</span></>}{selIsAnniv && <> <span className="dp-anniv">💞 our day</span></>}</h4>
            {selData.spent > 0 && <span className="dp-total">{fmt(selData.spent)}</span>}
          </div>
          {selIsAnniv && <div className="pinned-note anniv-note">💞 the {Number(g.sel.slice(8))}th — {ANNIV_LINES[g.month.getMonth() % 3]}</div>}
          {!selData.list.length && !selData.contribs.length && !selMarks.length && !selNotes.length && !selIsAnniv && (
            <div className="dp-empty"><span className="leaf">{selFuture ? "🌱" : "🌿"}</span>{selFuture ? copy.futureDay : copy.quietDay}</div>
          )}
          {selData.list.map((x) => { const c = x.kind === "moment" ? { emoji: x.moment_emoji || "✨", color: who(x.user_id) === "you" ? "var(--you-soft)" : "var(--him-soft)" } : catOf(x.category_id); return (
            <div className="mini" key={x.id}><span className="mcat" style={{ background: c.color }}>{c.emoji}</span><span className="mtxt">{x.note || x.moment_tag || c.name}</span>
              <span className={"who-pill " + (who(x.user_id) === "you" ? "wp-you" : "wp-him")}>{letterOf(x.user_id)}</span>{x.kind === "expense" && <span className="amt">{fmt(x.amount)}</span>}</div>); })}
          {selData.contribs.map((c) => { const goal = d.goals.find((x) => x.id === c.goal_id); return (
            <div className="mini" key={c.id}><span className="mcat" style={{ background: `color-mix(in srgb, ${goal?.color || "var(--sky)"} 55%, transparent)` }}>🎯</span>
              <span className="mtxt">into {goal?.name} {goal?.emoji}{c.note ? ` — ${c.note}` : ""}</span><span className={"who-pill " + (who(c.user_id) === "you" ? "wp-you" : "wp-him")}>{letterOf(c.user_id)}</span><span className="amt">＋{fmt(c.amount)}</span></div>); })}
          {selMarks.map((m) => (
            <div className="mini" key={m.id}><span className="mcat" style={{ background: "var(--chip)" }}>{m.emoji}</span><span className="mtxt">{m.label}{m.recurs !== "none" ? ` · every ${m.recurs === "monthly" ? "month" : "year"}` : ""}</span>
              <button className="mx" aria-label="Remove" onClick={() => supabase.from("calendar_marks").delete().eq("id", m.id)}>✕</button></div>))}
          {selNotes.map((n) => <div className="pinned-note" key={n.id}>📌 {n.kind === "list" ? n.title : n.body} <small style={{ opacity: .7 }}>— {nameOf(n.user_id)}</small></div>)}
          {adding ? (
            <div className="mark-add">
              <input className="note-input" placeholder="what's happening this day?" maxLength={40} value={mLabel} onChange={(e) => setMLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addMark()} autoFocus />
              <select value={mKind} onChange={(e) => setMKind(e.target.value)}>{MARK_KINDS.map(([k, e]) => <option key={k} value={k}>{e} {k}</option>)}</select>
              <select value={mRec} onChange={(e) => setMRec(e.target.value)}><option value="none">once</option><option value="monthly">monthly</option><option value="yearly">yearly</option></select>
              <button onClick={addMark}>add</button>
            </div>
          ) : <button className="add-note-btn" style={{ marginTop: 12 }} onClick={() => setAdding(true)}>＋ mark this day</button>}
        </div>
      </div>
    </div>
  );
}

function CycleCal({ d, today, back }) {
  const own = useCycleOwner(d);
  const g = useMonthGrid(today);
  const m = own?.rows.length ? buildModel(own.rows) : null;
  const T = fromKey(today);
  const selDate = fromKey(g.sel), info = m ? cycleInfo(selDate, m) : null;
  const log = own?.logs.find((l) => l.day === g.sel);
  return (
    <div>
      <button className="gh-back" onClick={back}>← back to calendars</button>
      <h2 className="pane-title">{own?.isMe ? "My" : "Her"} cycle calendar 🌸</h2>
      <p className="pane-sub">Tap a day — rose is the period, outlined days are predicted, butter is the fertile window.</p>
      <div className="cal-layout">
        <div className="cal-card">
          <div className="cal-head">
            <button onClick={() => g.setMonth(addMonths(g.month, -1))} aria-label="Previous month">‹</button><div className="month">{format(g.month, "MMMM yyyy")}</div>
            <button onClick={() => g.setMonth(addMonths(g.month, 1))} aria-label="Next month">›</button>
          </div>
          <div className="cyc-legend">
            <span className="cal-stat" style={{ background: "color-mix(in srgb, var(--rose) 38%, transparent)" }}><b>period</b></span>
            <span className="cal-stat" style={{ boxShadow: "inset 0 0 0 2px var(--rose)", background: "transparent" }}><b>predicted</b></span>
            <span className="cal-stat" style={{ background: "color-mix(in srgb, var(--butter) 40%, transparent)" }}><b>fertile</b></span>
            <span className="cal-stat" style={{ boxShadow: "inset 0 0 0 2.5px var(--butter-deep)", background: "transparent" }}>✦ <b>ovulation</b></span>
          </div>
          <div className="dow"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div>
          <div className="grid">
            {Array.from({ length: g.lead }).map((_, i) => <button key={"b" + i} className="day other" />)}
            {Array.from({ length: g.days }).map((_, i) => {
              const k = g.keyFor(i + 1), date = fromKey(k), inf = m ? cycleInfo(date, m) : null;
              const isFuture = k > today, predP = inf?.predicted && inf.phase === "period", marked = inf && (inf.fertile || inf.ovu);
              return (
                <button key={k} className={"day" + (inf && !inf.predicted && inf.phase === "period" ? " cyc-p" : "") + (predP ? " cyc-pred" : "") + (inf?.fertile && inf.phase !== "period" ? " cyc-f" : "") + (inf?.ovu ? " cyc-o" : "") + (k === today ? " today-day" : "") + (isFuture && !predP && !marked ? " future" : "") + (k === g.sel ? " sel" : "")}
                  onClick={() => g.setSel(k)}>
                  <span className="dnum">{i + 1}</span>{inf?.ovu && <span className="dstar">✦</span>}
                </button>);
            })}
          </div>
        </div>
        <div className="day-panel">
          <div className="dp-head"><h4>{format(selDate, "EEEE")} · {format(selDate, "MMMM d")}{g.sel === today && <> <span className="dp-today">today</span></>}</h4>
            {info && <span className="dp-total" style={{ borderColor: "var(--rose)", color: "var(--rose-text)" }}>day {info.day}</span>}</div>
          {info ? (<>
            <div className="mini"><span className="mcat" style={{ background: "var(--rose-soft)" }}>{PHASES[info.phase].e}</span><span className="mtxt">{info.predicted ? "predicted — " : ""}{PHASES[info.phase].name.toLowerCase()} phase{info.ovu ? " · ovulation day ✦" : info.fertile ? " · fertile window ✨" : ""}</span></div>
            {log && <div className="mini"><span className="mcat" style={{ background: "var(--rose-soft)" }}>📒</span><span className="mtxt">{log.flow && <><span className="flow-pill">{log.flow} flow</span> </>}{log.symptoms.length ? log.symptoms.join("  ·  ") : log.flow ? "" : "logged — feeling fine"}</span></div>}
            {log?.note && <div className="pinned-note" style={{ background: "var(--rose-soft)", color: "var(--rose-text)" }}>🌸 {log.note}</div>}
            {!log && !(selDate > T) && info.phase === "period" && !info.predicted && <div className="dp-empty"><span className="leaf">🌷</span>a period day — nothing extra logged</div>}
            {info.predicted && info.phase === "period" && <div className="pinned-note" style={{ background: "var(--rose-soft)", color: "var(--rose-text)" }}>🗓 pencilled in from the last few cycles — bodies improvise, dates shift</div>}
          </>) : <div className="dp-empty"><span className="leaf">🌿</span>{m ? "before the first logged cycle" : "nothing logged yet — the cycle page is where it starts 🌸"}</div>}
        </div>
      </div>
    </div>
  );
}
