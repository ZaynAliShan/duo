"use client";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useDuo, useLive } from "@/components/DuoProvider";
import MonthFilter, { filterRange, useMonthFilter } from "@/components/MonthFilter";
import Photo, { useSignedUrl } from "@/components/Photo";
import { dayKey, fromKey } from "@/lib/format";
import { copy } from "@/lib/copy";

const TILES = ["linear-gradient(150deg,var(--sage),var(--sky))", "linear-gradient(150deg,var(--peach),var(--butter))", "linear-gradient(150deg,var(--sky),var(--butter))"];

export default function MemoriesPage() {
  const { supabase, couple, tz } = useDuo();
  const [f, setF, today] = useMonthFilter();
  const [rows] = useLive(["entries"], async () => couple ? (await supabase.from("entries").select("*").eq("couple_id", couple.id).eq("kind", "moment").order("happened_at")).data || [] : []);
  const [lb, setLb] = useState(null);
  const moms = useMemo(() => {
    if (!rows) return [];
    const { lo, hi } = filterRange(f, today);
    return rows.map((x) => ({ ...x, k: dayKey(x.happened_at, tz) })).filter((x) => x.k >= lo && x.k <= hi);
  }, [rows, f, today, tz]);
  let lastM = null;
  return (
    <>
      <h2 className="pane-title">Memories 🎞</h2>
      <p className="pane-sub">Every moment you two kept — polaroids, not receipts.</p>
      <MonthFilter value={f} onChange={setF} today={today} />
      <div className="mem-count">{moms.length ? `${moms.length} ${moms.length === 1 ? "moment" : "moments"} kept 💛` : ""}</div>
      <div className="mem-wall">
        {!moms.length && rows && <div className="scrap-empty">{copy.memsEmpty}</div>}
        {moms.map((x, i) => {
          const m = x.k.slice(0, 7);
          const head = f.mode !== "month" && m !== lastM ? (lastM = m, <div className="mem-month" key={"h" + m}>{format(fromKey(m + "-01"), "MMMM yyyy")}</div>) : null;
          const cap = (x.note || x.moment_tag || "a moment") + " · " + format(fromKey(x.k), "MMM d");
          return [head,
            <div className={"polaroid" + (x.photo_path ? " openable" : "")} key={x.id} onClick={() => x.photo_path && setLb({ path: x.photo_path, cap })}>
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
  return (
    <div className={"mem-lb" + (lb ? " show" : "")} role="dialog" aria-modal="true" aria-label="Photo, full screen" onClick={onClose}>
      {url && <img src={url} alt={lb?.cap || ""} />}
      <div className="lb-cap">{lb?.cap}</div><div className="lb-hint">tap anywhere to close</div>
    </div>
  );
}
