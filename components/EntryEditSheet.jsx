"use client";
import { useEffect, useState } from "react";
import Sheet from "./Sheet";
import { useDuo } from "./DuoProvider";
import { MOMENT_TAGS } from "@/lib/palette";

/** Edit / delete your own entry (own-only is also enforced by RLS). */
export default function EntryEditSheet({ entry, onClose }) {
  const { supabase, categories, toast } = useDuo();
  const [amt, setAmt] = useState(""); const [cat, setCat] = useState(null); const [note, setNote] = useState(""); const [tag, setTag] = useState(null);
  const [armed, setArmed] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!entry) return;
    setAmt(entry.amount != null ? String(Math.round(entry.amount)) : ""); setCat(entry.category_id); setNote(entry.note || "");
    setTag(MOMENT_TAGS.find((t) => t[1] === entry.moment_tag) || null); setArmed(false);
  }, [entry?.id]);
  if (!entry) return <Sheet open={false} onClose={onClose} />;
  const isMoment = entry.kind === "moment";
  const valid = isMoment ? true : parseInt(amt || "0", 10) > 0 && cat;
  async function save() {
    setBusy(true);
    const patch = isMoment ? { note: note.trim(), moment_tag: tag?.[1] || null, moment_emoji: tag?.[0] || "✨" }
      : { amount: parseInt(amt, 10), category_id: cat, note: note.trim() };
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
    if (entry.photo_path) await supabase.storage.from("moments").remove([entry.photo_path]).catch(() => {});
    setBusy(false); onClose();
  }
  return (
    <Sheet open={!!entry} onClose={onClose}>
      <h3 className="c-title">{isMoment ? "Edit this moment ✨" : "Edit this entry ✏️"}</h3>
      {!isMoment && <>
        <input className="note-input amt-input" type="number" inputMode="numeric" min="1" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="amount (Rs)" />
        <div className="chip-row">{categories.filter((c) => !c.archived || c.id === cat).map((c) => (
          <button key={c.id} className={"chip" + (cat === c.id ? " sel" : "")} onClick={() => setCat(c.id)}>{c.emoji} {c.name}</button>))}</div>
      </>}
      {isMoment && <div className="chip-row" style={{ display: "flex" }}>{MOMENT_TAGS.map((t) => (
        <button key={t[1]} className={"chip" + (tag?.[1] === t[1] ? " sel" : "")} onClick={() => setTag(tag?.[1] === t[1] ? null : t)}>{t[0]} {t[1]}</button>))}</div>}
      <input className="note-input" maxLength={60} value={note} onChange={(e) => setNote(e.target.value)} placeholder="a little note…" />
      <button className="save-btn" disabled={!valid || busy} onClick={save}>Save changes 💛</button>
      <button className="g-del" onClick={del}>{armed ? "really remove it? tap again 🥺" : "🗑 remove this entry"}</button>
    </Sheet>
  );
}
