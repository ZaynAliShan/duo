"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { addMonths, endOfMonth, format, getDay, getDaysInMonth, isAfter, startOfMonth, subDays } from "date-fns";
import Sheet from "./Sheet";
import { useDuo } from "./DuoProvider";
import { MOMENT_TAGS } from "@/lib/palette";
import { fmt, todayKey, fromKey, keyOf, coupleNoonISO } from "@/lib/format";
import { uploadPhoto } from "@/lib/photos";
import { enqueue, isNetworkError } from "@/lib/offline-queue";

const PAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "⌫"];

export default function AddSheet({ open, onClose, onSaved }) {
  const { supabase, me, couple, categories, tz, toast } = useDuo();
  const [amt, setAmt] = useState("");
  const [cat, setCat] = useState(null);
  const [moment, setMoment] = useState(false);
  const [tag, setTag] = useState(null);
  const [note, setNote] = useState("");
  const [file, setFile] = useState(null);
  const [day, setDay] = useState(null);           // 'YYYY-MM-DD'
  const [pick, setPick] = useState(false);
  const [pcMonth, setPcMonth] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef();
  const today = todayKey(tz);
  const yesterday = keyOf(subDays(fromKey(today), 1));

  useEffect(() => { if (open) reset(); }, [open]); // a fresh sheet every time — a stale draft with a silently-reset day writes wrong entries

  const n = parseInt(amt || "0", 10);
  const valid = moment ? !!(tag || file || note.trim()) : n > 0 && !!cat;

  function press(k) {
    let a = k === "⌫" ? amt.slice(0, -1) : (amt + k).slice(0, 7);
    setAmt(a.replace(/^0+(?=\d)/, ""));
  }
  function reset() {
    setAmt(""); setCat(null); setTag(null); setNote(""); setFile(null); setDay(today); setPick(false); setMoment(false);
    setPcMonth(startOfMonth(fromKey(today)));
    if (fileRef.current) fileRef.current.value = "";
  }

  async function save() {
    if (!valid || busy) return;
    setBusy(true);
    // backdated entries get noon in the couple's timezone — not the device's — so the day agrees on both phones
    const happened = day === today ? new Date() : new Date(coupleNoonISO(day, tz));
    const row = {
      id: crypto.randomUUID(), // client id → offline replays are idempotent
      couple_id: couple.id, user_id: me.id,
      kind: moment ? "moment" : "expense",
      amount: moment ? null : n,
      category_id: moment ? null : cat.id,
      moment_tag: moment ? (tag?.[1] || null) : null,
      moment_emoji: moment ? (tag?.[0] || "✨") : null,
      note: note.trim() || (moment && !tag ? "" : note.trim()),
      happened_at: happened.toISOString(),
    };
    try {
      if (moment && file) {
        if (!navigator.onLine) { toast("photos need signal — saved the moment without it 💛"); }
        else row.photo_path = await uploadPhoto(supabase, "moments", `${couple.id}/${me.id}/${crypto.randomUUID()}.jpg`, file);
      }
      const { error } = await supabase.from("entries").insert(row);
      if (error) throw error;
    } catch (e) {
      if (!navigator.onLine || isNetworkError(e)) {
        const ok = await enqueue({ table: "entries", row });
        if (!ok) { toast("no signal and nowhere to keep it — try again when you're back online 💛"); setBusy(false); return; }
        toast("no signal — saved, it'll send itself 💛");
      } else { toast("that didn't save — " + (e.message || "try again")); setBusy(false); return; }
    }
    setBusy(false); reset(); onSaved?.();
  }

  const dateLbl = useMemo(() => {
    if (!day || day === today || day === yesterday) return "pick a day";
    return format(fromKey(day), "MMM d");
  }, [day, today]);

  return (
    <Sheet open={open} onClose={onClose} className={moment ? "moment-mode" : ""}>
      <div className="mode-row">
        <button className={"mode-btn" + (!moment ? " active" : "")} onClick={() => setMoment(false)}>Rs spending</button>
        <button className={"mode-btn" + (moment ? " active" : "")} onClick={() => setMoment(true)}>✨ a moment</button>
      </div>

      {!moment && (
        <div className="money-only">
          <div className="amt-display"><span className="cur">Rs </span>{n ? n.toLocaleString("en-PK") : <span className="zero">0</span>}</div>
          <div className="chip-row">
            {categories.filter((c) => !c.archived).map((c) => (
              <button key={c.id} className={"chip" + (cat?.id === c.id ? " sel" : "")} onClick={() => setCat(c)}>{c.emoji} {c.name}</button>
            ))}
          </div>
          <div className="date-row">
            <span className="dr-lbl">when?</span>
            <button className={"date-chip" + (day === today ? " sel" : "")} onClick={() => { setDay(today); setPick(false); }}>today</button>
            <button className={"date-chip" + (day === yesterday ? " sel" : "")} onClick={() => { setDay(yesterday); setPick(false); }}>yesterday</button>
            <button className={"date-chip" + (day !== today && day !== yesterday ? " sel" : "")} onClick={() => { setPick((p) => !p); setPcMonth(startOfMonth(fromKey(day || today))); }}>📅 {dateLbl}</button>
          </div>
          {pick && pcMonth && (
            <MiniCal month={pcMonth} setMonth={setPcMonth} today={today} selected={day}
              onPick={(k) => { setDay(k); setPick(false); }} />
          )}
        </div>
      )}

      {moment && (
        <div className="moment-only" style={{ display: "block" }}>
          <div className="chip-row" style={{ display: "flex" }}>
            {MOMENT_TAGS.map((t) => (
              <button key={t[1]} className={"chip" + (tag?.[1] === t[1] ? " sel" : "")} onClick={() => setTag(tag?.[1] === t[1] ? null : t)}>{t[0]} {t[1]}</button>
            ))}
          </div>
          <button className={"photo-btn" + (file ? " has" : "")} style={{ width: "100%", marginBottom: 12 }} onClick={() => fileRef.current?.click()}>
            {file ? "🖼 photo attached ✓ (tap to change)" : "📎 attach a photo (optional)"}
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </div>
      )}

      <input className="note-input" placeholder={moment ? "what happened? ✨" : "add a little note… (optional)"} maxLength={60}
        value={note} onChange={(e) => setNote(e.target.value)} />

      {!moment && (
        <div className="pad">{PAD.map((k) => <button key={k} onClick={() => press(k)}>{k}</button>)}</div>
      )}
      <button className="save-btn" disabled={!valid || busy} onClick={save}>{busy ? "saving…" : "Save it 💛"}</button>
    </Sheet>
  );
}

/** the in-sheet day picker — same calendar language as the month page */
export function MiniCal({ month, setMonth, today, selected, onPick, allowFuture = false }) {
  const lead = (getDay(month) + 6) % 7;
  const days = getDaysInMonth(month);
  const t = fromKey(today);
  const nextDisabled = !allowFuture && !isAfter(t, endOfMonth(month));
  return (
    <div className="pick-cal">
      <div className="cal-head">
        <button type="button" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">‹</button>
        <div className="month">{format(month, "MMMM yyyy")}</div>
        <button type="button" onClick={() => setMonth(addMonths(month, 1))} disabled={nextDisabled} aria-label="Next month">›</button>
      </div>
      <div className="dow"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div>
      <div className="grid">
        {Array.from({ length: lead }).map((_, i) => <button key={"b" + i} type="button" className="day other" />)}
        {Array.from({ length: days }).map((_, i) => {
          const d = new Date(month.getFullYear(), month.getMonth(), i + 1);
          const k = keyOf(d);
          const future = !allowFuture && isAfter(d, t);
          return (
            <button key={k} type="button" className={"day" + (k === today ? " today-day" : "") + (k === selected ? " sel" : "") + (future ? " future" : "")}
              onClick={() => !future && onPick(k)}>
              <span className="dnum">{i + 1}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
