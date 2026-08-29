"use client";
import { useEffect, useState } from "react";
import { useDuo } from "./DuoProvider";
import Photo from "./Photo";
import { heartPop } from "./Confetti";
import { fmt, relTime } from "@/lib/format";

/** One instagram-style post — expense or moment — with the 💛 heart. */
export default function FeedPost({ entry: x, hearts = [], fresh, onEdit }) {
  const { supabase, me, partner, who, categories, couple, nameOf } = useDuo();
  const cls = who(x.user_id);
  const mine = x.user_id === me.id;
  const cat = categories.find((c) => c.id === x.category_id);
  const isMoment = x.kind === "moment";
  const c = isMoment ? { emoji: x.moment_emoji || "✨", color: cls === "you" ? "var(--you-soft)" : "var(--him-soft)" } : (cat || { emoji: "🌀", color: "#EDE7DE", name: "Other" });
  const serverLoved = hearts.some((h) => h.user_id === me.id);
  const [optimistic, setOptimistic] = useState(null); // null → follow the server
  useEffect(() => { setOptimistic(null); }, [serverLoved, hearts.length]);
  const loved = optimistic ?? serverLoved;
  const [busy, setBusy] = useState(false);
  const profile = mine ? me : partner;
  const whoTag = <b className={cls}>{mine ? "you" : nameOf(x.user_id)}</b>;
  const verb = isMoment ? "shared a moment ✨" : "logged spending";

  async function toggleHeart(ev) {
    if (busy) return; setBusy(true);
    const el = ev.currentTarget; // React nulls currentTarget after the sync phase
    const next = !loved;
    setOptimistic(next);
    if (next) heartPop(el);
    const { error } = next
      ? await supabase.from("hearts").upsert({ entry_id: x.id, couple_id: couple.id, user_id: me.id }, { onConflict: "entry_id,user_id", ignoreDuplicates: true })
      : await supabase.from("hearts").delete().eq("entry_id", x.id).eq("user_id", me.id);
    if (error) setOptimistic(null);
    setBusy(false);
  }
  const n = hearts.length + (optimistic === null ? 0 : optimistic && !serverLoved ? 1 : !optimistic && serverLoved ? -1 : 0);
  return (
    <div className={"igpost" + (fresh ? " new" : "")} id={"e-" + x.id}>
      <div className="ig-head">
        <div className={"ig-ava " + cls}>{profile?.avatar_url ? <Photo bucket="avatars" path={profile.avatar_url} /> : (profile?.display_name || "?").charAt(0).toUpperCase()}</div>
        <div className="ig-who">{whoTag} {verb}</div>
        <span className="ig-time">{relTime(x.happened_at)}</span>
        {mine && onEdit && <span className="ig-menu"><button onClick={() => onEdit(x)} aria-label="Edit entry">✏️</button></span>}
      </div>
      {x.photo_path ? (
        <div className="ig-media has-photo"><Photo bucket="moments" path={x.photo_path} alt="" />{isMoment && <span className="ig-badge">{c.emoji}</span>}</div>
      ) : (
        <div className="ig-media" style={{ background: `linear-gradient(150deg, ${c.color}, var(--card))` }}>
          <span className="ig-emoji">{c.emoji}</span>
          {isMoment ? <span className="ig-tag">{x.moment_tag || "a moment"}</span>
            : <><span className="ig-amt">{fmt(x.amount)}</span><span className="ig-tag">{c.name}</span></>}
        </div>
      )}
      <div className="ig-actions">
        <button className={"heart" + (loved ? " loved" : "")} onClick={toggleHeart}>{loved ? "💛" : "🤍"}</button>
        <span className="ig-likes">{n ? n + (n === 1 ? " love" : " loves") : "be the first to 💛"}</span>
      </div>
      <div className="ig-cap">{x.note ? <>{whoTag} {x.note}</> : null}</div>
    </div>
  );
}
