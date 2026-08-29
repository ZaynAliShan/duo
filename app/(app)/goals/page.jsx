"use client";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { useDuo, useLive } from "@/components/DuoProvider";
import Sheet from "@/components/Sheet";
import { fetchGoals } from "@/lib/queries/goals";
import { fmt } from "@/lib/format";
import { paceLine } from "@/lib/pace";
import { GOAL_COLORS, GOAL_EMOJIS, BUCKET_EMOJIS } from "@/lib/palette";
import { copy } from "@/lib/copy";

export default function GoalsPage() {
  const { supabase, couple, me, who, nameOf, letterOf, confetti, toast } = useDuo();
  const [d, refresh] = useLive(["goals", "goal_contributions", "bucket_items"], () => (couple ? fetchGoals(supabase, couple.id) : null));
  const [view, setView] = useState("hub"); // hub | jars | bucket | history
  const [histId, setHistId] = useState(null);
  const [contrib, setContrib] = useState(null);   // goal
  const [editGoal, setEditGoal] = useState(undefined); // undefined closed · null new · goal
  const [editDream, setEditDream] = useState(null);
  const [newDream, setNewDream] = useState("");
  useEffect(() => { window.scrollTo({ top: 0 }); }, [view]);
  if (!d) return <h2 className="pane-title">Our goals 🎯</h2>;
  const { jars, bucket } = d;
  const tSaved = jars.reduce((s, g) => s + g.saved, 0), tTarget = jars.reduce((s, g) => s + g.target, 0);
  const jPct = tTarget ? Math.min(100, Math.round((tSaved / tTarget) * 100)) : 0;
  const full = jars.filter((g) => g.saved >= g.target).length;
  const done = bucket.filter((b) => b.done_at).length;
  const bPct = bucket.length ? Math.round((done / bucket.length) * 100) : 0;

  async function tick(it) {
    const now = !it.done_at;
    await supabase.from("bucket_items").update({ done_at: now ? new Date().toISOString() : null, done_by: now ? me.id : null }).eq("id", it.id);
    if (now) confetti();
  }
  async function addDream() {
    const t = newDream.trim(); if (!t) return;
    await supabase.from("bucket_items").insert({ couple_id: couple.id, title: t, emoji: BUCKET_EMOJIS[bucket.length % 6], added_by: me.id, sort: bucket.length });
    setNewDream("");
  }

  return (
    <>
      {view === "hub" && (
        <div id="goalsHub">
          <h2 className="pane-title">Our goals 🎯</h2>
          <p className="pane-sub">Everything you two are dreaming toward — the money and the magic.</p>
          <div className="hub-hero">
            <div className="hh-label">Saved toward our dreams</div>
            <div className="hh-big">{fmt(tSaved)}</div>
            <div className="hh-sub">of {fmt(tTarget)} — {jPct}% of the way there</div>
            <div className="hh-track"><div className="hh-fill" style={{ width: jPct + "%" }} /></div>
            <div className="hh-chips">
              <span className="hh-chip">🫙 {jars.length} {jars.length === 1 ? "jar" : "jars"}</span>
              {full > 0 && <span className="hh-chip">🎉 {full} full</span>}
              <span className="hh-chip">🌈 {bucket.length} {bucket.length === 1 ? "dream" : "dreams"}</span>
              <span className="hh-chip">✓ {done} ticked off</span>
            </div>
          </div>
          <div className="hub-grid">
            <button className="hub-card" id="hubJarsCard" onClick={() => setView("jars")}>
              <span className="wm">🫙</span>
              <div className="hub-ring" style={{ "--ring-c": "var(--sky)", "--p": jPct + "%" }}><span className="rp">{jPct}%</span><span className="rl">saved</span></div>
              <div className="hub-info">
                <div className="hub-name">Savings jars 🫙</div>
                <div className="hub-line"><b>{fmt(tSaved)}</b> of {fmt(tTarget)}</div>
                <div className="hub-meta">{jars.length} {jars.length === 1 ? "jar" : "jars"} on the go · {full} full{full ? " 🎉" : ""}</div>
                <div className="hub-mini">{jars.map((g) => <span key={g.id} className="hub-pill">{g.emoji} {g.pct}%</span>)}</div>
              </div>
              <span className="hub-go">→</span>
            </button>
            <button className="hub-card" id="hubBucketCard" onClick={() => setView("bucket")}>
              <span className="wm">🌈</span>
              <div className="hub-ring" style={{ "--ring-c": "var(--sage)", "--p": bPct + "%" }}><span className="rp">{done}/{bucket.length}</span><span className="rl">ticked</span></div>
              <div className="hub-info">
                <div className="hub-name">Bucket list 🌈</div>
                <div className="hub-line"><b>{done}</b> of {bucket.length} dreams ticked off</div>
                <div className="hub-meta">{bucket.length - done ? `${bucket.length - done} still waiting ✨` : "all done — dream bigger 🌈"}</div>
                <div className="hub-mini">{bucket.map((it) => <span key={it.id} className={"hub-pill" + (it.done_at ? " done" : "")}>{it.emoji}{it.done_at ? " ✓" : ""}</span>)}</div>
              </div>
              <span className="hub-go">→</span>
            </button>
          </div>
        </div>
      )}

      {view === "jars" && (
        <div>
          <button className="gh-back" onClick={() => setView("hub")}>← back to goals</button>
          <h2 className="pane-title">Our jars 🫙</h2>
          <p className="pane-sub">Fill them together. 100% is worth confetti.</p>
          <div id="goalWrap">
            {!jars.length && <div className="scrap-empty">{copy.jarsEmpty}</div>}
            {jars.map((g) => {
              const last = g.hist[0];
              return (
                <div className="goal-card" key={g.id}>
                  <div className="jar"><div className="liquid" style={{ background: g.color, height: g.pct + "%" }} /><div className="pct">{g.pct}%</div></div>
                  <div className="goal-info">
                    <div className="gname-row">
                      <div className="gname">{g.name} {g.emoji}</div>
                      <div className="gbtns">
                        <button className="hist-btn" title="Edit jar" aria-label="Edit jar" onClick={() => setEditGoal(g)}>✏️</button>
                        <button className="hist-btn" title="Contribution history" aria-label="Contribution history" onClick={() => { setHistId(g.id); setView("history"); }}>🕐</button>
                      </div>
                    </div>
                    <div className="gnum"><b>{fmt(g.saved)}</b> of {fmt(g.target)}{g.target_date ? ` · by ${format(new Date(g.target_date + "T12:00"), "MMM yyyy")}` : ""}</div>
                    {g.pct >= 100 ? <div className="goal-done-tag">{copy.goalDone}</div> : (
                      <>
                        <div className="pace">{paceLine({ saved: g.saved, target: g.target, target_date: g.target_date })}</div>
                        <div className="contrib-row"><button className="contrib c-you" onClick={() => setContrib(g)}>＋ add to the jar</button></div>
                      </>
                    )}
                    <div className="ghistory">{last ? `${nameOf(last.user_id)} added ${fmt(last.amount)} · ${format(new Date(last.created_at), "MMM d")} 💛` : copy.firstContribution}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <button className="add-note-btn" onClick={() => setEditGoal(null)}>＋ start a new jar</button>
        </div>
      )}

      {view === "bucket" && (
        <div>
          <button className="gh-back" onClick={() => setView("hub")}>← back to goals</button>
          <h2 className="pane-title">Our bucket list 🌈</h2>
          <p className="pane-sub">not money — just dreams. tick one off together.</p>
          <div className="bucket">
            {!bucket.length && <div className="scrap-empty">{copy.bucketEmpty}</div>}
            {bucket.map((it) => (
              <div className={"b-item" + (it.done_at ? " done" : "")} key={it.id}>
                <button className="b-main" onClick={() => tick(it)}>
                  <span className="b-cb">{it.done_at ? "✓" : ""}</span><span className="b-emoji">{it.emoji}</span><span className="b-txt">{it.title}</span>
                </button>
                <span className={"who-pill " + (who(it.added_by) === "you" ? "wp-you" : "wp-him")}>{letterOf(it.added_by)}</span>
                <button className="hist-btn b-edit" title="Edit dream" onClick={() => setEditDream(it)}>✏️</button>
              </div>
            ))}
            <div className="b-add-row">
              <input className="note-input" placeholder="add a dream…" maxLength={40} value={newDream} onChange={(e) => setNewDream(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addDream()} />
              <button onClick={addDream}>add ✨</button>
            </div>
          </div>
        </div>
      )}

      {view === "history" && <History g={jars.find((x) => x.id === histId)} back={() => setView("jars")} />}

      <ContributeSheet g={contrib} onClose={() => setContrib(null)} />
      <GoalSheet g={editGoal} onClose={() => setEditGoal(undefined)} count={jars.length} />
      <DreamSheet it={editDream} onClose={() => setEditDream(null)} />
    </>
  );
}

function History({ g, back }) {
  const { me, partner, nameOf, letterOf, who } = useDuo();
  if (!g) return null;
  const tot = { you: 0, him: 0 };
  g.hist.forEach((h) => { tot[who(h.user_id)] += Number(h.amount); });
  const all = tot.you + tot.him || 1;
  return (
    <div id="goalHistory">
      <button className="gh-back" onClick={back}>← back to the jars</button>
      <div className="gh-card">
        <div className="gh-head"><span className="gh-name">{g.name} {g.emoji}</span><span className="gh-sum"><b>{fmt(g.saved)}</b> of {fmt(g.target)} · {g.pct}%</span></div>
        <div className="gh-bar"><div className="gh-fill" style={{ width: g.pct + "%", background: g.color }} /></div>
        <div className="gh-summary">
          <div className="gh-stat you"><span className="gh-coin you">{letterOf(me.id)}</span><div><div className="v vy">{fmt(tot.you)}</div><div className="k">by {me.display_name} · {Math.round((tot.you / all) * 100)}% of the jar</div></div></div>
          {partner && <div className="gh-stat him"><span className="gh-coin him">{letterOf(partner.id)}</span><div><div className="v vh">{fmt(tot.him)}</div><div className="k">by {partner.display_name} · {Math.round((tot.him / all) * 100)}% of the jar</div></div></div>}
        </div>
        <div className="gh-scroll"><table className="gh-table">
          <thead><tr><th>Who</th><th>Contribution</th><th className="th-date">Date</th></tr></thead>
          <tbody>
            {!g.hist.length && <tr><td colSpan={3} style={{ textAlign: "center", padding: "20px 0", fontFamily: "var(--hand)", fontSize: 15.5, color: "var(--ink-soft)" }}>{copy.firstContribution}</td></tr>}
            {g.hist.map((h) => (
              <tr key={h.id}>
                <td><span className={"gh-coin " + who(h.user_id)}>{letterOf(h.user_id)}</span></td>
                <td><span className="td-amt">{fmt(h.amount)}</span>{h.note && <span className="gh-note"> · {h.note}</span>}</td>
                <td className="td-date">{format(new Date(h.created_at), "MMM d, yyyy")}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}

function ContributeSheet({ g, onClose }) {
  const { supabase, couple, me, confetti, toast } = useDuo();
  const [amt, setAmt] = useState(""); const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { setAmt(""); setNote(""); }, [g?.id]);
  const n = parseInt(amt || "0", 10);
  async function save() {
    if (!(n > 0) || busy) return; setBusy(true);
    const { error } = await supabase.from("goal_contributions").insert({ goal_id: g.id, couple_id: couple.id, user_id: me.id, amount: n, note: note.trim() });
    if (error) { toast("couldn't add — " + error.message); setBusy(false); return; }
    // completed_at is maintained by a DB trigger (race-proof when both partners add at once) — we just celebrate
    if (g.saved < g.target && g.saved + n >= g.target) confetti();
    setBusy(false); onClose();
  }
  return (
    <Sheet open={!!g} onClose={onClose}>
      <h3 className="c-title">Add to {g?.name} {g?.emoji}</h3>
      <div className="chip-row">{[1000, 2500, 5000, 10000].map((a) => <button key={a} className={"chip" + (n === a ? " sel" : "")} onClick={() => setAmt(String(a))}>Rs {a.toLocaleString("en-PK")}</button>)}</div>
      <input className="note-input amt-input" type="number" inputMode="numeric" min="1" placeholder="or type any amount (Rs)" value={amt} onChange={(e) => setAmt(e.target.value)} />
      <input className="note-input" placeholder="a little note… (optional)" maxLength={40} value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="save-btn" disabled={!(n > 0) || busy} onClick={save}>Add to the jar 💛</button>
    </Sheet>
  );
}

function GoalSheet({ g, onClose, count }) {
  const { supabase, couple, confetti, toast } = useDuo();
  const open = g !== undefined;
  const [name, setName] = useState(""); const [emoji, setEmoji] = useState(GOAL_EMOJIS[0]); const [color, setColor] = useState(GOAL_COLORS[0]);
  const [target, setTarget] = useState(""); const [date, setDate] = useState(""); const [armed, setArmed] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => {
    setArmed(false);
    if (g) { setName(g.name); setEmoji(g.emoji); setColor(g.color); setTarget(String(Math.round(g.target))); setDate(g.target_date || ""); }
    else { setName(""); setEmoji(GOAL_EMOJIS[0]); setColor(GOAL_COLORS[0]); setTarget(""); setDate(""); }
  }, [g, open]);
  const t = parseInt(target || "0", 10);
  const valid = name.trim() && t > 0;
  async function save() {
    if (!valid || busy) return; setBusy(true);
    const row = { name: name.trim(), emoji, color, target_amount: t, target_date: date || null };
    let error;
    if (g) {
      ({ error } = await supabase.from("goals").update(row).eq("id", g.id)); // completed_at: DB trigger
      if (!error && g.saved < g.target && g.saved >= t) confetti(); // lowering the target can finish a jar
    } else ({ error } = await supabase.from("goals").insert({ ...row, couple_id: couple.id, sort: count }));
    setBusy(false);
    if (error) toast("couldn't save — " + error.message); else onClose();
  }
  async function del() {
    if (!armed) { setArmed(true); return; }
    await supabase.from("goals").delete().eq("id", g.id); onClose();
  }
  return (
    <Sheet open={open} onClose={onClose}>
      <h3 className="c-title">{g ? `Edit ${g.name} ${g.emoji}` : "Start a new jar 🫙"}</h3>
      <input className="note-input" placeholder="what are you two saving for?" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} />
      <div className="chip-row">{GOAL_EMOJIS.map((e) => <button key={e} className={"chip" + (emoji === e ? " sel" : "")} style={{ fontSize: 17 }} onClick={() => setEmoji(e)}>{e}</button>)}</div>
      <input className="note-input amt-input" type="number" inputMode="numeric" min="1" placeholder="target amount (Rs)" value={target} onChange={(e) => setTarget(e.target.value)} />
      <div className="row2"><span className="sheet-label" style={{ alignSelf: "center", margin: 0, flex: "0 0 auto" }}>by when? (optional)</span><input className="note-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      <div className="color-row">{GOAL_COLORS.map((c) => <button key={c} className={"color-dot" + (color === c ? " sel" : "")} style={{ background: c }} aria-label="Jar color" onClick={() => setColor(c)} />)}</div>
      <button className="save-btn" disabled={!valid || busy} onClick={save}>Save the jar 💛</button>
      {g && <button className="g-del" onClick={del}>{armed ? "really remove it? tap again 🥺" : "🗑 remove this jar"}</button>}
    </Sheet>
  );
}

function DreamSheet({ it, onClose }) {
  const { supabase, toast } = useDuo();
  const [t, setT] = useState(""); const [e, setE] = useState("✨"); const [armed, setArmed] = useState(false);
  useEffect(() => { if (it) { setT(it.title); setE(it.emoji); setArmed(false); } }, [it?.id]);
  async function save() {
    if (!t.trim()) return;
    const { error } = await supabase.from("bucket_items").update({ title: t.trim(), emoji: e }).eq("id", it.id);
    if (error) toast(error.message); else onClose();
  }
  async function del() { if (!armed) { setArmed(true); return; } await supabase.from("bucket_items").delete().eq("id", it.id); onClose(); }
  return (
    <Sheet open={!!it} onClose={onClose}>
      <h3 className="c-title">Edit this dream {it?.emoji}</h3>
      <input className="note-input" placeholder="what's the dream?" maxLength={40} value={t} onChange={(ev) => setT(ev.target.value)} />
      <div className="chip-row">{BUCKET_EMOJIS.map((x) => <button key={x} className={"chip" + (e === x ? " sel" : "")} style={{ fontSize: 17 }} onClick={() => setE(x)}>{x}</button>)}</div>
      <button className="save-btn" disabled={!t.trim()} onClick={save}>Save the dream 💛</button>
      <button className="g-del" onClick={del}>{armed ? "really let it go? tap again 🥺" : "🗑 let this dream go"}</button>
    </Sheet>
  );
}
