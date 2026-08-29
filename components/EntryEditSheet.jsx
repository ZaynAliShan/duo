"use client";
import { useEffect, useState } from "react";
import Sheet from "./Sheet";
import { useDuo } from "./DuoProvider";
import { MOMENT_TAGS } from "@/lib/palette";
import { dayKey, todayKey, coupleNoonISO, parseAmount } from "@/lib/format";
import { removeQuietly } from "@/lib/photos";

/** Edit / delete your own entry (own-only is also enforced by RLS). */
export default function EntryEditSheet({ entry, onClose }) {
  const { supabase, categories, toast, tz } = useDuo();
  const [amt, setAmt] = useState(""); const [cat, setCat] = useState(null); const [note, setNote] = useState(""); const [tag, setTag] = useState(null);
  const [day, setDay] = useState("");
  const [armed, setArmed] = useState(false); const [busy, setBusy] = useState(false);
  const today = todayKey(tz);
  useEffect(() => {
    if (!entry) return;
    setAmt(entry.amount != null ? String(Math.round(entry.amount)) : ""); setCat(entry.category_id); setNote(entry.note || "");
    setTag(MOMENT_TAGS.find((t) => t[1] === entry.moment_tag) || null); setArmed(false);
    setDay(dayKey(entry.happened_at, tz));
  }, [entry?.id]);
  if (!entry) return <Sheet open={false} onClose={onClose} />;
  const isMoment = entry.kind === "moment";
  const n = parseAmount(amt);
  const dayOk = /^\d{4}-\d{2}-\d{2}$/.test(day) && day <= today;
  const valid = dayOk && (isMoment ? true : n != null && !!cat);
  async function save() {
    if (!valid || busy) return; setBusy(true);
    const patch = isMoment ? { note: note.trim(), moment_tag: tag?.[1] || null, moment_emoji: tag?.[0] || "✨" }
      : { amount: n, category_id: cat, note: note.trim() };
    // a moved day lands at noon in the couple's timezone (same rule as a backdated add); an unchanged day keeps its exact time
    if (day !== dayKey(entry.happened_at, tz)) patch.happened_at = day === today ? new Date().toISOString() : coupleNoonISO(day, tz);
    const { error } = await supabase.from("entries").update(patch).eq("id", entry.id);
    setBusy(false);
    if (error) toast("couldn't save — " + error.message); else onClose();
  }
  async function del() {
    if (!armed) { setArmed(true); return; }
    if (busy) return; setBusy(true);
    // the row goes first — if this fails, the photo must survive with it
    const { error } = await supabase.from("entries").delete().eq("id", entry.id);
    if (error) { toast("couldn't remove — " + error.message); setBusy(false); return; }
    if (entry.photo_path) await removeQuietly(supabase, "moments", entry.photo_path);
    setBusy(false); onClose();
  }
  return (
    <Sheet open={!!entry} onClose={onClose}>
      <h3 className="c-title">{isMoment ? "Edit this moment ✨" : "Edit this entry ✏️"}</h3>
      {!isMoment && <>
        <input className="note-input amt-input" type="text" inputMode="numeric" pattern="[0-9]*" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d]/g, "").slice(0, 9))} placeholder="amount (Rs, whole rupees)" />
        <div className="chip-row">{categories.filter((c) => !c.archived || c.id === cat).map((c) => (
          <button key={c.id} className={"chip" + (cat === c.id ? " sel" : "")} onClick={() => setCat(c.id)}>{c.emoji} {c.name}</button>))}</div>
      </>}
      {isMoment && <div className="chip-row" style={{ display: "flex" }}>{MOMENT_TAGS.map((t) => (
        <button key={t[1]} className={"chip" + (tag?.[1] === t[1] ? " sel" : "")} onClick={() => setTag(tag?.[1] === t[1] ? null : t)}>{t[0]} {t[1]}</button>))}</div>}
      <input className="note-input" maxLength={60} value={note} onChange={(e) => setNote(e.target.value)} placeholder="a little note…" />
      <div className="row2"><span className="sheet-label" style={{ alignSelf: "center", margin: 0, flex: "0 0 auto" }}>which day?</span><input className="note-input" type="date" max={today} value={day} onChange={(e) => setDay(e.target.value)} /></div>
      <button className="save-btn" disabled={!valid || busy} onClick={save}>Save changes 💛</button>
      <button className="g-del" onClick={del}>{armed ? "really remove it? tap again 🥺" : "🗑 remove this entry"}</button>
    </Sheet>
  );
}
