"use client";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useDuo, useLive, must, LoadError } from "@/components/DuoProvider";
import MonthFilter, { filterRange, useMonthFilter } from "@/components/MonthFilter";
import Photo, { useSignedUrl } from "@/components/Photo";
import { dayKey, fromKey } from "@/lib/format";
import { copy } from "@/lib/copy";

const TILES = ["linear-gradient(150deg,var(--sage),var(--sky))", "linear-gradient(150deg,var(--peach),var(--butter))", "linear-gradient(150deg,var(--sky),var(--butter))"];

export default function MemoriesPage() {
  const { supabase, couple, tz } = useDuo();
  const [f, setF, today] = useMonthFilter();
  const { lo, hi } = filterRange(f, today);
  // fetch only the picked stretch (the "all time" chip still asks for everything, on purpose)
  const [rows, refresh, error] = useLive(["entries"], async () => {
    if (!couple) return [];
    let q = supabase.from("entries").select("*").eq("couple_id", couple.id).eq("kind", "moment").order("happened_at");
    // a day of slack on both ends: device midnight ≠ couple midnight; the exact filter is done below on the couple-tz key
    if (f.mode !== "all") q = q.gte("happened_at", new Date(fromKey(lo).getTime() - 86400000).toISOString()).lt("happened_at", new Date(fromKey(hi).getTime() + 2 * 86400000).toISOString());
    return must(await q);
  }, [lo, hi, f.mode]);
  const [lb, setLb] = useState(null);
  const moms = useMemo(() => {
    if (!rows) return [];
    return rows.map((x) => ({ ...x, k: dayKey(x.happened_at, tz) })).filter((x) => x.k >= lo && x.k <= hi);
  }, [rows, lo, hi, tz]);
  let lastM = null;
  return (
    <>
      <h2 className="pane-title">Memories 🎞</h2>
      <p className="pane-sub">Every moment you two kept — polaroids, not receipts.</p>
      <MonthFilter value={f} onChange={setF} today={today} />
      <LoadError error={error} onRetry={refresh} what="the memories" />
      <div className="mem-count">{moms.length ? `${moms.length} ${moms.length === 1 ? "moment" : "moments"} kept 💛` : ""}</div>
      <div className="mem-wall">
        {!moms.length && rows && <div className="scrap-empty">{copy.memsEmpty}</div>}
        {moms.map((x, i) => {
          const m = x.k.slice(0, 7);
          const head = f.mode !== "month" && m !== lastM ? (lastM = m, <div className="mem-month" key={"h" + m}>{format(fromKey(m + "-01"), "MMMM yyyy")}</div>) : null;
          const cap = (x.note || x.moment_tag || "a moment") + " · " + format(fromKey(x.k), "MMM d");
          return [head,
            <div className={"polaroid" + (x.photo_path ? " openable" : "")} key={x.id} role={x.photo_path ? "button" : undefined} tabIndex={x.photo_path ? 0 : undefined}
              onClick={() => x.photo_path && setLb({ path: x.photo_path, cap })} onKeyDown={(e) => { if (x.photo_path && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setLb({ path: x.photo_path, cap }); } }}>
              <div className="ph" style={x.photo_path ? undefined : { background: TILES[i % 3] }}>{x.photo_path ? <Photo bucket="moments" path={x.photo_path} alt="" /> : (x.moment_emoji || "✨")}</div>
              <div className="cap">{cap}</div>
            </div>];
        })}
      </div>
      <Lightbox lb={lb} onClose={() => setLb(null)} />
    </>
  );
}
function Lightbox({ lb, onClose }) {
  const url = useSignedUrl("moments", lb?.path);
  // Esc closes; focus moves into the dialog and back out again
  useEffect(() => {
    if (!lb) return;
    const prev = document.activeElement;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", onKey);
    document.getElementById("mem-lb-close")?.focus();
    return () => { removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [lb]);
  return (
    <div className={"mem-lb" + (lb ? " show" : "")} role="dialog" aria-modal={lb ? "true" : undefined} aria-label="Photo, full screen" inert={lb ? undefined : true} onClick={onClose}>
      {url && <img src={url} alt={lb?.cap || ""} />}
      <div className="lb-cap">{lb?.cap}</div>
      <button id="mem-lb-close" className="lb-hint" style={{ background: "none", border: 0, color: "inherit", font: "inherit" }} onClick={onClose}>tap anywhere (or Esc) to close</button>
    </div>
  );
}
