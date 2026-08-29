"use client";
import { useEffect, useRef, useState } from "react";
import { addMonths, format, startOfMonth, subMonths } from "date-fns";
import { MiniCal } from "./AddSheet";
import { fromKey, keyOf, todayKey } from "@/lib/format";
import { useDuo } from "./DuoProvider";

/** Month · Month · Month · All time · Custom… — shared by Us and Memories.
 *  value: {mode:'month'|'all'|'custom', month:'YYYY-MM', from:'YYYY-MM-DD', to:'YYYY-MM-DD'} */
export function useMonthFilter() {
  const { tz } = useDuo();
  const today = todayKey(tz);
  const [f, setF] = useState(() => ({ mode: "month", month: today.slice(0, 7), from: keyOf(subMonths(fromKey(today), 1)), to: today }));
  return [f, setF, today];
}
export function filterRange(f, today) {
  if (f.mode === "all") return { lo: "0000-01-01", hi: "9999-12-31" };
  if (f.mode === "custom") { const a = f.from <= f.to ? f.from : f.to, b = a === f.from ? f.to : f.from; return { lo: a, hi: b }; }
  return { lo: f.month + "-01", hi: f.month + "-31" };
}
export function filterLabel(f, today) {
  if (f.mode === "all") return "All time";
  if (f.mode === "custom") { const { lo, hi } = filterRange(f); return `${format(fromKey(lo), "MMM d")} → ${format(fromKey(hi), "MMM d")}`; }
  const m = fromKey(f.month + "-01");
  return f.month === today.slice(0, 7) ? format(m, "MMMM") + " so far" : format(m, "MMMM yyyy");
}

export default function MonthFilter({ value: f, onChange, today, extra }) {
  const months = [0, 1, 2].map((i) => startOfMonth(subMonths(fromKey(today), i)));
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [cal, setCal] = useState(startOfMonth(fromKey(today)));
  const ref = useRef();
  useEffect(() => {
    const h = (e) => { if (!e.target.isConnected) return; if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setPicking(false); } };
    document.addEventListener("click", h); return () => document.removeEventListener("click", h);
  }, []);
  const { lo, hi } = filterRange(f, today);
  return (
    <>
      <div className="us-filters">
        {extra}
        <div className="f-group">
          {months.map((m) => { const k = format(m, "yyyy-MM"); return (
            <button key={k} className={"fchip" + (f.mode === "month" && f.month === k ? " active" : "")} onClick={() => onChange({ ...f, mode: "month", month: k })}>{format(m, "MMMM")}</button>); })}
          <button className={"fchip" + (f.mode === "all" ? " active" : "")} onClick={() => onChange({ ...f, mode: "all" })}>All time</button>
          <button className={"fchip" + (f.mode === "custom" ? " active" : "")} onClick={() => onChange({ ...f, mode: "custom" })}>Custom…</button>
        </div>
      </div>
      <div className={"range-row" + (f.mode === "custom" ? " show" : "")} ref={ref}>
        <button className="range-btn" onClick={() => setOpen((o) => !o)}>📅 {format(fromKey(lo), "MMM d")} → {format(fromKey(hi), "MMM d, yyyy")}</button>
        <div className={"range-pop" + (open ? " show" : "")}>
          <div className="rp-hint">{picking ? "now tap the end day 💛" : "tap a start day, then an end day"}</div>
          <MiniCal month={cal} setMonth={setCal} today={today} selected={picking ? f.from : null}
            onPick={(k) => { if (!picking) { onChange({ ...f, from: k, to: k }); setPicking(true); } else { onChange({ ...f, to: k }); setPicking(false); } }} />
          <button className="rp-done" onClick={() => { setOpen(false); setPicking(false); }}>done ✓</button>
        </div>
      </div>
    </>
  );
}
