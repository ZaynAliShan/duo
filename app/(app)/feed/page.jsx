"use client";
import { useEffect, useRef, useState } from "react";
import { useDuo, useLive } from "@/components/DuoProvider";
import FeedPost from "@/components/FeedPost";
import EntryEditSheet from "@/components/EntryEditSheet";
import { fetchFeed } from "@/lib/queries/feed";
import { copy } from "@/lib/copy";

export default function FeedPage() {
  const { supabase, couple } = useDuo();
  const [data] = useLive(["entries", "hearts"], () => (couple ? fetchFeed(supabase, couple.id) : { entries: [], heartsBy: {} }));
  const [editing, setEditing] = useState(null);
  const seen = useRef(new Set()); const [fresh, setFresh] = useState(null);
  useEffect(() => {
    if (!data) return;
    const ids = data.entries.map((e) => e.id);
    if (seen.current.size) { const n = ids.find((id) => !seen.current.has(id)); if (n) { setFresh(n); setTimeout(() => document.getElementById("e-" + n)?.scrollIntoView({ block: "center", behavior: "smooth" }), 50); } }
    ids.forEach((id) => seen.current.add(id));
  }, [data]);
  return (
    <>
      <h2 className="pane-title">Our feed 📸</h2>
      <p className="pane-sub">Both of you, live — every rupee and every moment, newest first.</p>
      <div className="ig-wrap">
        {!data ? null : !data.entries.length ? <div className="scrap-empty">{copy.feedEmpty}</div>
          : data.entries.map((e) => <FeedPost key={e.id} entry={e} hearts={data.heartsBy[e.id] || []} fresh={e.id === fresh} onEdit={setEditing} />)}
      </div>
      <EntryEditSheet entry={editing} onClose={() => setEditing(null)} />
    </>
  );
}
