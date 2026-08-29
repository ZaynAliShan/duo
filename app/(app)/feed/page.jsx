"use client";
import { useEffect, useRef, useState } from "react";
import { useDuo, useLive, LoadError } from "@/components/DuoProvider";
import FeedPost from "@/components/FeedPost";
import EntryEditSheet from "@/components/EntryEditSheet";
import { fetchFeed } from "@/lib/queries/feed";
import { copy } from "@/lib/copy";

const PAGE = 100;

export default function FeedPage() {
  const { supabase, couple } = useDuo();
  const [limit, setLimit] = useState(PAGE);
  const [data, refresh, error] = useLive(["entries", "hearts"], () => (couple ? fetchFeed(supabase, couple.id, { limit }) : { entries: [], heartsBy: {}, hasMore: false }), [limit]);
  const [editing, setEditing] = useState(null);
  const seen = useRef(new Set()); const [fresh, setFresh] = useState(null);
  const grew = useRef(false);
  useEffect(() => {
    if (!data) return;
    const ids = data.entries.map((e) => e.id);
    // a "load more" adds many unseen ids at once — that's paging, not a fresh post; don't scroll
    if (seen.current.size && !grew.current) { const n = ids.find((id) => !seen.current.has(id)); if (n) { setFresh(n); setTimeout(() => document.getElementById("e-" + n)?.scrollIntoView({ block: "center", behavior: "smooth" }), 50); } }
    grew.current = false;
    ids.forEach((id) => seen.current.add(id));
  }, [data]);
  return (
    <>
      <h2 className="pane-title">Our feed 📸</h2>
      <p className="pane-sub">Both of you, live — every rupee and every moment, newest first.</p>
      <LoadError error={error} onRetry={refresh} what="the feed" />
      <div className="ig-wrap">
        {!data ? null : !data.entries.length ? <div className="scrap-empty">{copy.feedEmpty}</div>
          : data.entries.map((e) => <FeedPost key={e.id} entry={e} hearts={data.heartsBy[e.id] || []} fresh={e.id === fresh} onEdit={setEditing} />)}
        {data?.hasMore && <button className="ghost-btn" style={{ width: "100%" }} onClick={() => { grew.current = true; setLimit((l) => l + PAGE); }}>show older entries ↓</button>}
      </div>
      <EntryEditSheet entry={editing} onClose={() => setEditing(null)} />
    </>
  );
}
