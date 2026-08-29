"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { useDuo, useLive } from "@/components/DuoProvider";
import Sheet from "@/components/Sheet";
import Editable from "@/components/Editable";
import { NOTE_COLORS } from "@/lib/palette";
import { ago, fromKey } from "@/lib/format";

const FMN_SECS = [{ key: "dates", name: "Important dates 🗓", tape: "t-rose" }, { key: "favs", name: "Favorites ⭐", tape: "t-butter" }, { key: "other", name: "Other 💭", tape: "t-sky" }];

export default function NotesPage() {
  const { supabase, couple, me, partner, who, letterOf, toast } = useDuo();
  const [d] = useLive(["notes", "list_items", "facts", "goals"], async () => {
    if (!couple) return null;
    const [n, li, f, g] = await Promise.all([
      supabase.from("notes").select("*").eq("couple_id", couple.id).order("created_at"),
      supabase.from("list_items").select("*").eq("couple_id", couple.id).order("sort").order("created_at"),
      supabase.from("facts").select("*").eq("couple_id", couple.id).order("sort").order("created_at"),
      supabase.from("goals").select("id,name,emoji").eq("couple_id", couple.id),
    ]);
    return { notes: n.data || [], items: li.data || [], facts: f.data || [], goals: g.data || [] };
  });
  const [view, setView] = useState("board");
  const [filter, setFilter] = useState("all");
  const [pinBox, setPinBox] = useState(null); // 'note' | 'list'
  const [editingId, setEditingId] = useState(null);
  const [pinNote, setPinNote] = useState(null);
  const [gone, setGone] = useState({});
  const boardRef = useRef();
  useEffect(() => { window.scrollTo({ top: 0 }); }, [view]);
  const facts = d?.facts || [];
  const counts = useMemo(() => ({ filled: facts.filter((f) => f.value).length, empty: facts.filter((f) => !f.value).length }), [facts]);

  async function addNote(kind, color) {
    const who = filter === "all" ? me.id : filter;
    if (who !== me.id) { toast("notes are signed by whoever writes them — switch to your board 💛"); return; }
    const row = { couple_id: couple.id, user_id: me.id, kind, color, title: kind === "list" ? "new list 🧺" : "", body: kind === "list" ? "" : "",
      tilt: Math.random() * 7 - 3.5, pos_x: 0.03 + Math.random() * 0.5, pos_y: 0.05 + Math.random() * (kind === "list" ? 0.35 : 0.6) };
    const { data, error } = await supabase.from("notes").insert(row).select().single();
    setPinBox(null);
    if (error) { toast("couldn't stick that — " + error.message); return; }
    if (kind === "list") await supabase.from("list_items").insert({ note_id: data.id, couple_id: couple.id, text: "first thing 🧺", added_by: me.id, sort: 0 });
    else setEditingId(data.id);
  }
  async function peel(n) {
    setGone((g) => ({ ...g, [n.id]: true }));
    setTimeout(async () => { const { error } = await supabase.from("notes").delete().eq("id", n.id); if (error) { toast(error.message); setGone((g) => ({ ...g, [n.id]: false })); } }, 400);
  }

  if (!d) return <h2 className="pane-title">The corkboard 📌</h2>;
  const notes = d.notes.filter((n) => filter === "all" || n.user_id === filter).sort((a, b) => (b.pinned_top ? 1 : 0) - (a.pinned_top ? 1 : 0));

  if (view === "fmn") return <Fmn facts={facts} back={() => setView("board")} />;

  return (
    <div id="notesBoard">
      <h2 className="pane-title">The corkboard 📌</h2>
      <p className="pane-sub">Drag them around. ✏️ to edit, 📌 to pin, ✕ to peel one off.</p>

      <button className="hub-card fmn-nav" onClick={() => setView("fmn")}>
        <span className="wm">🌸</span>
        <div className="hub-info">
          <div className="hub-name">Forget-me-nots 🌸</div>
          <div className="hub-line">the little (and big) things — so you never have to ask twice</div>
          <div className="hub-meta">{counts.filled} things remembered{counts.empty ? ` · ${counts.empty} to fill out ✏️` : " 🎉"}</div>
        </div>
        <span className="hub-go">→</span>
      </button>

      <div className="f-group board-filter">
        <button className={"fchip" + (filter === "all" ? " active" : "")} onClick={() => setFilter("all")}>Both 💛</button>
        <button className={"fchip" + (filter === me.id ? " active" : "")} onClick={() => setFilter(me.id)}>{me.display_name}</button>
        {partner && <button className={"fchip" + (filter === partner.id ? " active" : "")} onClick={() => setFilter(partner.id)}>{partner.display_name}</button>}
      </div>
      <div className="board" ref={boardRef}>
        {notes.map((n) => (
          <StickyNote key={n.id} n={n} items={d.items.filter((i) => i.note_id === n.id)} board={boardRef} goals={d.goals}
            editing={editingId === n.id} setEditing={(v) => setEditingId(v ? n.id : null)} onPeel={() => peel(n)} onPin={() => setPinNote(n)} gone={gone[n.id]} />
        ))}
        {!notes.length && <div className="scrap-empty" style={{ position: "absolute", left: 16, top: 16, color: "#6B4423" }}>an empty corkboard — stick the first note 📌</div>}
      </div>
      {pinBox && (
        <div className="pin-box">
          <span className="pb-label">which colour for the {pinBox}? 🎨</span>
          {NOTE_COLORS.map((c) => <button key={c.c} className="pb-swatch" style={{ background: c.css }} aria-label={c.label} onClick={() => addNote(pinBox, c.c)} />)}
        </div>
      )}
      <button className="add-note-btn" onClick={() => setPinBox(pinBox === "note" ? null : "note")}>＋ stick a new note</button>
      <button className="add-note-btn" onClick={() => setPinBox(pinBox === "list" ? null : "list")}>🧺 start a list</button>

      <PinSheet n={pinNote} goals={d.goals} onClose={() => setPinNote(null)} />
    </div>
  );
}

function StickyNote({ n, items, board, editing, setEditing, onPeel, onPin, gone, goals }) {
  const { supabase, me, who, letterOf, couple } = useDuo();
  const mine = n.user_id === me.id;
  const el = useRef();
  const [pos, setPos] = useState(null);
  const [fresh] = useState(() => Date.now() - new Date(n.created_at).getTime() < 3000);
  const [editItem, setEditItem] = useState(null);
  const drag = useRef(null);
  useEffect(() => { setPos(null); }, [n.pos_x, n.pos_y]);

  function down(e) {
    if (e.target.closest(".peel,.npen,.npin,.nlist") || e.target.isContentEditable) return;
    drag.current = { sx: e.clientX, sy: e.clientY, ox: el.current.offsetLeft, oy: el.current.offsetTop, moved: false };
    el.current.classList.add("dragging"); el.current.setPointerCapture(e.pointerId);
  }
  function move(e) {
    const d = drag.current; if (!d) return;
    const b = board.current, bw = b.clientWidth - el.current.offsetWidth, bh = b.clientHeight - el.current.offsetHeight;
    d.moved = true;
    setPos({ x: Math.max(2, Math.min(bw - 2, d.ox + e.clientX - d.sx)), y: Math.max(2, Math.min(bh - 2, d.oy + e.clientY - d.sy)) });
  }
  async function up() {
    const d = drag.current; drag.current = null; el.current?.classList.remove("dragging");
    if (!d?.moved || !el.current) return;
    const b = board.current;
    await supabase.from("notes").update({ pos_x: (el.current.offsetLeft / b.clientWidth).toFixed(4), pos_y: (el.current.offsetTop / b.clientHeight).toFixed(4) }).eq("id", n.id);
  }
  const style = pos ? { left: pos.x + "px", top: pos.y + "px" } : { left: `clamp(2px, ${n.pos_x * 100}%, calc(100% - 216px))`, top: `clamp(2px, ${n.pos_y * 100}%, calc(100% - 175px))` };
  const isList = n.kind === "list";
  const pinLbl = [n.pinned_top && "📌", n.pinned_day && "📅 " + format(fromKey(n.pinned_day), "MMM d"), n.goal_id && (goals.find((g) => g.id === n.goal_id)?.emoji || "🎯")].filter(Boolean).join(" ");

  return (
    <div ref={el} className={`note ${n.color}${isList ? " is-list" : ""}${fresh ? " fresh" : ""}${gone ? " gone" : ""}${n.pinned_top ? " is-pinned" : ""}`}
      style={{ ...style, transform: `rotate(${n.tilt}deg)`, zIndex: n.pinned_top ? 5 : undefined }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <span className={"who-tag " + (who(n.user_id) === "you" ? "wt-you" : "wt-him")}>{letterOf(n.user_id)}</span>
      {mine && <button className="peel" aria-label="Remove note" onClick={(e) => { e.stopPropagation(); onPeel(); }}>✕</button>}
      {mine && !isList && <button className="npen" aria-label="Edit note" onClick={(e) => { e.stopPropagation(); setEditing(true); }}>✏️</button>}
      <button className="npen npin" style={{ right: mine ? (isList ? 38 : 67) : 9 }} aria-label="Pin note" onClick={(e) => { e.stopPropagation(); onPin(); }}>📌</button>
      {isList ? (
        <>
          <Editable as="span" className="note-title" value={n.title} placeholder="a list" editing={editItem === "title"} disabled={!mine}
            onStart={() => setEditItem("title")} onCommit={async (t) => { setEditItem(null); if (t !== n.title) await supabase.from("notes").update({ title: t || "a list" }).eq("id", n.id); }} />
          <ul className="nlist">
            {items.map((it) => (
              <li key={it.id} className={it.done ? "done" : ""}>
                <span className="cb" onClick={async (e) => { e.stopPropagation(); await supabase.from("list_items").update({ done: !it.done }).eq("id", it.id); }}>{it.done ? "✓" : ""}</span>
                <Editable className="li-txt" value={it.text} editing={editItem === it.id} onStart={() => setEditItem(it.id)}
                  onCommit={async (t) => { setEditItem(null); if (!t) await supabase.from("list_items").delete().eq("id", it.id); else if (t !== it.text) await supabase.from("list_items").update({ text: t }).eq("id", it.id); }} />
              </li>
            ))}
            <li className="n-add" onClick={async (e) => { e.stopPropagation(); const { data } = await supabase.from("list_items").insert({ note_id: n.id, couple_id: couple.id, text: "…", added_by: me.id, sort: items.length }).select().single(); if (data) setEditItem(data.id); }}>
              <span className="cb">＋</span><span className="li-txt">add</span>
            </li>
          </ul>
        </>
      ) : (
        <Editable className="note-text" value={n.body} placeholder="…" editing={editing} disabled={!mine} onStart={() => mine && setEditing(true)}
          onCommit={async (t) => { setEditing(false); if (t !== n.body) await supabase.from("notes").update({ body: t || "…" }).eq("id", n.id); }} />
      )}
      <span className="note-age">{n.updated_at !== n.created_at ? "edited " : ""}{ago(n.updated_at || n.created_at)}</span>
      {pinLbl && <span className="pin-top">{pinLbl}</span>}
    </div>
  );
}

function PinSheet({ n, goals, onClose }) {
  const { supabase } = useDuo();
  const [day, setDay] = useState(""); const [goal, setGoal] = useState(""); const [top, setTop] = useState(false);
  useEffect(() => { if (n) { setDay(n.pinned_day || ""); setGoal(n.goal_id || ""); setTop(!!n.pinned_top); } }, [n?.id]);
  async function save() { await supabase.from("notes").update({ pinned_top: top, pinned_day: day || null, goal_id: goal || null }).eq("id", n.id); onClose(); }
  return (
    <Sheet open={!!n} onClose={onClose}>
      <h3 className="c-title">Pin this note 📌<small>either of you can pin — the words stay the author's</small></h3>
      <button className={"cyc-share" + (top ? " on" : "")} style={{ width: "100%", justifyContent: "center", marginBottom: 12 }} onClick={() => setTop(!top)}>pin to the top of the board <span className="sw" /></button>
      <div className="sheet-label">pin to a calendar day</div>
      <input className="note-input" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
      <div className="sheet-label">attach to a jar</div>
      <select className="note-input" value={goal} onChange={(e) => setGoal(e.target.value)}>
        <option value="">— none —</option>
        {goals.map((g) => <option key={g.id} value={g.id}>{g.emoji} {g.name}</option>)}
      </select>
      <button className="save-btn" onClick={save}>Save pins 💛</button>
    </Sheet>
  );
}

function Fmn({ facts, back }) {
  const { supabase, couple, me, partner } = useDuo();
  const [tab, setTab] = useState("us");
  const [editing, setEditing] = useState(null); // `${id}:t` | `${id}:v`
  const about = tab === "us" ? null : tab;
  const list = facts.filter((f) => (about ? f.about_profile_id === about : f.about_profile_id === null));
  async function add(section) {
    const { data } = await supabase.from("facts").insert({ couple_id: couple.id, about_profile_id: about, section, emoji: "💭", label: "", value: "", sort: list.length }).select().single();
    if (data) setEditing(data.id + ":t");
  }
  return (
    <div id="fmnPage">
      <button className="gh-back" onClick={back}>← back to the corkboard</button>
      <h2 className="pane-title">Forget-me-nots 🌸</h2>
      <p className="pane-sub">Remember the little (and big) things.</p>
      <div className="f-group fmn-tabs">
        {partner && <button className={"fchip" + (tab === partner.id ? " active" : "")} onClick={() => setTab(partner.id)}>{partner.display_name}</button>}
        <button className={"fchip" + (tab === me.id ? " active" : "")} onClick={() => setTab(me.id)}>{me.display_name}</button>
        <button className={"fchip" + (tab === "us" ? " active" : "")} onClick={() => setTab("us")}>Us 💛</button>
      </div>
      {FMN_SECS.map((sec) => (
        <div className="fmn-sec" key={sec.key}>
          <span className={"fmn-tape " + sec.tape} />
          <div className="fs-head"><span className="fs-title">{sec.name}</span><button className="fs-add" aria-label="Add a forget-me-not" onClick={() => add(sec.key)}>＋</button></div>
          <div className="fs-rows">
            {list.filter((f) => f.section === sec.key).map((f) => (
              <div className="fmn-item" key={f.id}>
                <span className="fi-emoji">{f.emoji}</span>
                <div className="fi-main">
                  <Editable as="div" className="fi-t" value={f.label} placeholder="name me" editing={editing === f.id + ":t"} onStart={() => setEditing(f.id + ":t")}
                    onCommit={async (t) => { setEditing(null); if (t !== f.label) await supabase.from("facts").update({ label: t }).eq("id", f.id); }} />
                  <Editable as="div" className="fi-v" value={f.value} placeholder="fill me out ✏️" editing={editing === f.id + ":v"} onStart={() => setEditing(f.id + ":v")}
                    onCommit={async (t) => { setEditing(null); if (t !== f.value) await supabase.from("facts").update({ value: t }).eq("id", f.id); }} />
                </div>
                <button className="fi-x" aria-label="Remove" onClick={() => supabase.from("facts").delete().eq("id", f.id)}>✕</button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
