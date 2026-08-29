"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format, subDays } from "date-fns";
import { useDuo, useLive } from "@/components/DuoProvider";
import Sheet from "@/components/Sheet";
import { buildModel, cycleInfo, nextOvulation, PHASES, CYC_FACTS, SYMPTOMS, diffDays, addDays } from "@/lib/cycle";
import { fromKey, keyOf, todayKey, hashDay } from "@/lib/format";
import { fetchCycle, useCycleOwner } from "@/lib/queries/cycle";

const CFMT = (d) => format(d, "MMM d");

export default function CyclePage() {
  const { supabase, couple, me, partner, tz, reload, toast } = useDuo();
  const router = useRouter();
  const today = todayKey(tz);
  const T = fromKey(today);
  const [d] = useLive(["cycles", "cycle_logs", "profiles"], () => (couple ? fetchCycle(supabase, couple.id) : null));
  const own = useCycleOwner(d);
  const [logOpen, setLogOpen] = useState(false);
  const ringRef = useRef(), markerRef = useRef();
  const m = useMemo(() => (own ? buildModel(own.rows) : null), [own]);
  const info = m ? cycleInfo(T, m) : null;
  const meta = info ? PHASES[info.phase] : null;

  // the ring sweeps in clockwise; the marker rides the sweep to today
  useEffect(() => {
    if (!info || !m || !ringRef.current) return;
    const L = m.avgLen, ovuD = L - 13;
    const s1 = (info.pLen / L) * 100, s2 = ((ovuD - 1.5) / L) * 100, s3 = ((ovuD + 0.5) / L) * 100, angle = ((info.day - 0.5) / L) * 360;
    const draw = (e) => { const p = (x) => x * e + "%";
      ringRef.current.style.background = `conic-gradient(var(--rose) 0 ${p(s1)}, var(--sage) ${p(s1)} ${p(s2)}, var(--butter) ${p(s2)} ${p(s3)}, var(--lilac) ${p(s3)} ${p(100)}, var(--chip) 0)`;
      markerRef.current.style.transform = `rotate(${angle * e}deg)`; };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { draw(1); return; }
    const t0 = performance.now(); let raf;
    const sweep = (now) => { const t = Math.min(1, (now - t0) / 950); draw(1 - Math.pow(1 - t, 3)); if (t < 1) raf = requestAnimationFrame(sweep); };
    raf = requestAnimationFrame(sweep); return () => cancelAnimationFrame(raf);
  }, [info?.day, m?.avgLen]);

  if (!d || !own) return <h2 className="pane-title">Her cycle 🌸</h2>;
  const owner = own.owner, first = (owner?.display_name || "her").split(" ")[0];
  const her = own.isMe ? "your" : `${first}'s`;
  const daysToNext = m?.nextStart ? diffDays(T, m.nextStart) : null;
  const todayLog = own.logs.find((l) => l.day === today);
  const nOvu = m ? nextOvulation(T, m) : null;

  async function toggleShare() {
    const { error } = await supabase.from("profiles").update({ cycle_shared: !me.cycle_shared }).eq("id", me.id);
    if (error) toast(error.message); else reload();
  }

  return (
    <>
      <h2 className="pane-title">{own.isMe ? "My cycle 🌸" : "Her cycle 🌸"}</h2>
      <p className="pane-sub">{own.isMe ? "Your rhythm, gently tracked — logs, phases, and what's coming." : `${first}'s rhythm, gently tracked — logs, phases, and what's coming.`}</p>

      {!own.rows.length ? (
        <div className="cyc-card cyc-hero">
          <div style={{ fontSize: 46 }}>🌸</div>
          <p className="pane-sub" style={{ marginTop: 8 }}>{partner ? "Nothing logged yet. Whoever this rhythm belongs to logs the first period here — predictions start from the second cycle." : "Nothing logged yet — log the first period and Duo starts learning the rhythm."}</p>
          <button className="cyc-log-btn" onClick={() => setLogOpen(true)}>Log today 🌸</button>
          {partner && <p className="cyc-foot">sharing is off by default — the switch appears once you've logged something.</p>}
        </div>
      ) : (
        <div className="cyc-layout">
          <div className="cyc-col">
            <div className="cyc-card cyc-hero">
              <div className="cyc-ring" ref={ringRef}>
                <div className="cyc-marker" ref={markerRef} />
                <div className="cyc-center">
                  <span className="cd-day">Day {info?.day ?? "—"} of ~{m.avgLen}</span>
                  <span className="cd-phase">{meta ? `${meta.name} ${meta.e}` : "—"}</span>
                  <span className="cd-next">{info?.phase === "period" ? `flow day ${info.day} 🌹` : daysToNext == null ? "" : daysToNext >= 0 ? `period in ~${daysToNext} days` : "running a little late — bodies improvise 🌱"}</span>
                </div>
              </div>
              <div className="cyc-ringkey">
                <span><i style={{ background: "var(--rose)" }} />period</span><span><i style={{ background: "var(--sage)" }} />follicular</span>
                <span><i style={{ background: "var(--butter)" }} />ovulation</span><span><i style={{ background: "var(--lilac)" }} />luteal</span>
              </div>
              {own.isMe && <button className="cyc-log-btn" onClick={() => setLogOpen(true)}>Log today 🌸</button>}
              <div className="cyc-today-log">
                {todayLog ? <>logged today 💛<div className="tl-chips">
                  {todayLog.flow && <span className="tl-chip">🌹 {todayLog.flow} flow</span>}
                  {todayLog.symptoms.map((s) => <span className="tl-chip" key={s}>{s}</span>)}
                  {todayLog.note && <span className="tl-chip">📝 {todayLog.note}</span>}</div></> : "nothing logged today yet"}
              </div>
              {own.isMe && partner && (
                <button className={"cyc-share" + (me.cycle_shared ? " on" : "")} aria-pressed={me.cycle_shared} onClick={toggleShare}>
                  {me.cycle_shared ? `sharing with ${partner.display_name} ` : `just for me `}<span className="sw" />
                </button>
              )}
            </div>
            {meta && !own.isMe && (
              <div>
                <div className="care-label">🫶 taking care of {first} — for {me.display_name}</div>
                <div className="care-row">{meta.care.map((c) => <div className="care-card" key={c.t}><div className="cc-emoji">{c.e}</div><div className="cc-title">{c.t}</div><div className="cc-txt">{c.d}</div></div>)}</div>
              </div>
            )}
          </div>

          <div className="cyc-col">
            {meta && (
              <div className="phase-card" style={{ background: `linear-gradient(125deg, color-mix(in srgb, ${meta.arc} 24%, var(--card)), var(--card) 72%)` }}>
                <div className="ph-label">right now</div>
                <div className="ph-name">{meta.name} phase {meta.e}</div>
                <div className="ph-body">{meta.body}</div>
                <div className="ph-feel" style={{ borderColor: meta.arc }}>💭 {meta.feel}</div>
                <div className="ph-tips">{meta.tips.map((t) => <div className="ph-tip" key={t}>{t}</div>)}</div>
              </div>
            )}
            <div className="pred-row">
              <Chip k="🌹 next period" v={daysToNext >= 0 ? <>{CFMT(m.nextStart)} <small>· in {daysToNext} days</small></> : <>any day now <small>· pencilled {CFMT(m.nextStart)}</small></>} />
              {nOvu && <Chip k="✨ fertile window" v={`${CFMT(addDays(nOvu, -5))} – ${CFMT(addDays(nOvu, 1))}`} />}
              {nOvu && <Chip k="✦ ovulation" v={`~ ${CFMT(nOvu)}`} />}
              <Chip k="🗓 the one after" v={CFMT(m.next2)} />
            </div>
            <button className="cyc-cal-link" onClick={() => router.push("/cal/cycle")}>🗓 see it all on {her} cycle calendar <span>→</span></button>
            <div className="cyc-card">
              <h4 style={{ fontFamily: "var(--hand)", fontSize: 20, margin: "0 0 10px" }}>{own.isMe ? "My" : "Her"} cycles, lately 📈</h4>
              <div className="cyc-stats-line">
                <span className="cal-stat">🔄 cycle ≈ <b>{m.avgLen} days</b></span><span className="cal-stat">🌹 period ≈ <b>{m.avgPeriod} days</b></span><span className="cal-stat">📒 <b>{m.count}</b> {m.count === 1 ? "cycle" : "cycles"} logged</span>
              </div>
              <div className="cyc-hist">
                {m.starts.slice(1).map((s, i) => { const len = diffDays(m.starts[i], s); return <Bar key={i} lbl={CFMT(m.starts[i])} w={Math.min(100, Math.round((len / 34) * 100))} val={`${len} days`} />; })}
                {info && !info.predicted && <Bar lbl={CFMT(m.starts[m.starts.length - 1])} w={Math.min(100, Math.round((info.day / 34) * 100))} val={`day ${info.day} 🌱`} live />}
              </div>
            </div>
            <div className="cyc-fact"><div className="cf-label">💡 did you know</div><div className="cf-txt">{CYC_FACTS[hashDay(today) % CYC_FACTS.length]}</div></div>
          </div>
        </div>
      )}
      <p className="cyc-foot">🌱 estimates based on logged cycles — not medical advice, and not contraception.</p>
      <CycleLogSheet open={logOpen} onClose={() => setLogOpen(false)} today={today} rows={own.rows} todayLog={todayLog} avgPeriod={m?.avgPeriod || 5} />
    </>
  );
}
const Chip = ({ k, v }) => <div className="pred-chip"><div className="pk">{k}</div><div className="pv">{v}</div></div>;
function Bar({ lbl, w, val, live }) {
  const [width, setW] = useState(0);
  useEffect(() => { const id = requestAnimationFrame(() => requestAnimationFrame(() => setW(w))); return () => cancelAnimationFrame(id); }, [w]);
  return <div className="ch-row"><span className="ch-lbl">{lbl}</span><div className="ch-track"><div className={"ch-fill" + (live ? " live" : "")} style={{ width: width + "%" }} /></div><span className="ch-val">{val}</span></div>;
}

export function CycleLogSheet({ open, onClose, today, rows, todayLog, avgPeriod }) {
  const { supabase, couple, me, toast } = useDuo();
  const [started, setStarted] = useState(false); const [ended, setEnded] = useState(false); const [off, setOff] = useState(0);
  const [flow, setFlow] = useState(null); const [syms, setSyms] = useState([]); const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);
  const T = fromKey(today);
  const openCycle = rows.filter((r) => !r.period_end).sort((a, b) => b.period_start.localeCompare(a.period_start))[0];
  useEffect(() => { if (open) { setStarted(false); setEnded(false); setOff(0); setFlow(todayLog?.flow || null); setSyms(todayLog?.symptoms || []); setNote(todayLog?.note || ""); } }, [open]);
  const valid = started || ended || flow || syms.length || note.trim();
  async function save() {
    if (!valid || busy) return; setBusy(true);
    try {
      if (started) {
        const start = keyOf(subDays(T, off));
        if (openCycle) await supabase.from("cycles").update({ period_end: keyOf(addDays(fromKey(openCycle.period_start), avgPeriod - 1)) }).eq("id", openCycle.id);
        const { error } = await supabase.from("cycles").upsert({ couple_id: couple.id, user_id: me.id, period_start: start }, { onConflict: "user_id,period_start" });
        if (error) throw error;
      } else if (ended && openCycle) {
        await supabase.from("cycles").update({ period_end: today }).eq("id", openCycle.id);
      }
      const { error } = await supabase.from("cycle_logs").upsert({ couple_id: couple.id, user_id: me.id, day: today, flow, symptoms: syms, note: note.trim() }, { onConflict: "user_id,day" });
      if (error) throw error;
      onClose();
    } catch (e) { toast("couldn't log — " + e.message); }
    setBusy(false);
  }
  return (
    <Sheet open={open} onClose={onClose}>
      <h3 className="c-title">{me?.display_name}, today 🌸</h3>
      {openCycle && diffDays(fromKey(openCycle.period_start), T) < 12 ? (
        <button className={"cyc-period-btn" + (ended ? " sel" : "")} onClick={() => setEnded(!ended)}>{ended ? "🌷 period ended today ✓" : "🌷 my period ended"}</button>
      ) : (
        <button className={"cyc-period-btn" + (started ? " sel" : "")} onClick={() => setStarted(!started)}>{started ? "🌹 period started ✓" : "🌹 my period started"}</button>
      )}
      {started && <>
        <div className="sheet-label">when did it start?</div>
        <div className="chip-row">{[0, 1, 2, 3, 4].map((o) => <button key={o} className={"chip" + (off === o ? " sel-rose" : "")} onClick={() => setOff(o)}>{o === 0 ? "today" : o === 1 ? "yesterday" : CFMT(subDays(T, o))}</button>)}</div>
      </>}
      <div className="sheet-label">flow (if any)</div>
      <div className="chip-row">{["light", "medium", "heavy"].map((f) => <button key={f} className={"chip" + (flow === f ? " sel-rose" : "")} onClick={() => setFlow(flow === f ? null : f)}>🌹 {f}</button>)}</div>
      <div className="sheet-label">how's the body feeling?</div>
      <div className="chip-row">{SYMPTOMS.map((s) => <button key={s} className={"chip" + (syms.includes(s) ? " sel-rose" : "")} onClick={() => setSyms(syms.includes(s) ? syms.filter((x) => x !== s) : [...syms, s])}>{s}</button>)}</div>
      <input className="note-input" placeholder="a little note… (optional)" maxLength={60} value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="save-btn rose" disabled={!valid || busy} onClick={save}>Log it 🌸</button>
    </Sheet>
  );
}
