"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addMonths, differenceInCalendarDays, endOfMonth, format, startOfMonth, subDays, subMonths } from "date-fns";
import { useDuo, useLive, must, LoadError } from "@/components/DuoProvider";
import MonthFilter, { filterLabel, filterRange, useMonthFilter } from "@/components/MonthFilter";
import Photo from "@/components/Photo";
import { fmt, dayKey, fromKey, parseAmount } from "@/lib/format";
import { CAT_COLORS, SWATCHES } from "@/lib/palette";
import { buildRecap } from "@/lib/recap";
import { uploadPhoto, freshPath, removeQuietly } from "@/lib/photos";
import { signOutClean } from "@/lib/session";
import { copy } from "@/lib/copy";

export default function UsPage() {
  const { supabase, couple, me, partner, tz, categories } = useDuo();
  const [f, setF, today] = useMonthFilter();
  const [mode, setMode] = useState("spend");
  const [whoF, setWhoF] = useState("all");
  const [d, refresh, error] = useLive(["entries", "goal_contributions", "goals", "categories", "couples", "profiles"], async () => {
    if (!couple) return null;
    const [e, c, g, r] = await Promise.all([
      supabase.from("entries").select("*").eq("couple_id", couple.id).order("happened_at"),
      supabase.from("goal_contributions").select("*").eq("couple_id", couple.id).order("created_at"),
      supabase.from("goals").select("*").eq("couple_id", couple.id),
      supabase.from("recaps").select("*").eq("couple_id", couple.id),
    ]);
    return { entries: must(e).map((x) => ({ ...x, k: dayKey(x.happened_at, tz) })), contribs: must(c).map((x) => ({ ...x, k: dayKey(x.created_at, tz) })), goals: must(g), recaps: must(r) };
  });
  if (!d) return <><h2 className="pane-title">Us 💸</h2><LoadError error={error} onRetry={refresh} what="this page" /></>;
  return (
    <>
      <LoadError error={error} onRetry={refresh} what="the latest" />
      <Story d={d} today={today} />
      <MoneyPicture d={d} f={f} setF={setF} today={today} mode={mode} setMode={setMode} whoF={whoF} setWhoF={setWhoF} />
      <Budgets d={d} today={today} />
      <Recap d={d} today={today} />
      <Settings />
      <button className="nux-replay" onClick={() => window.dispatchEvent(new Event("duo-nux-replay"))}>take the tour again 💛</button>
    </>
  );
}

/* ① since day one */
function Story({ d, today }) {
  const { couple, categories, tz } = useDuo();
  const T = fromKey(today);
  const stats = useMemo(() => {
    // saved together = all contributions + Σ finished months of capped categories: max(0, cap − spent)
    let saved = d.contribs.reduce((s, c) => s + Number(c.amount), 0);
    const capped = categories.filter((c) => c.monthly_cap && !c.archived);
    if (capped.length && d.entries.length) {
      // every FINISHED calendar month since the first entry — a quiet month counts its full caps too
      const first = d.entries.reduce((min, e) => (e.k < min ? e.k : min), d.entries[0].k).slice(0, 7);
      for (let m = fromKey(first + "-01"); ; m = addMonths(m, 1)) {
        const mk = format(m, "yyyy-MM");
        if (mk >= today.slice(0, 7)) break;
        capped.forEach((c) => {
          const spent = d.entries.filter((e) => e.kind === "expense" && e.category_id === c.id && e.k.startsWith(mk)).reduce((s, e) => s + Number(e.amount), 0);
          saved += Math.max(0, Number(c.monthly_cap) - spent);
        });
      }
    }
    const days = [...new Set(d.entries.map((e) => e.k))].sort();
    let longest = 0, run = 0, prev = null;
    days.forEach((k) => { run = prev && differenceInCalendarDays(fromKey(k), fromKey(prev)) === 1 ? run + 1 : 1; longest = Math.max(longest, run); prev = k; });
    const done = d.goals.filter((g) => g.completed_at).length;
    return { saved, longest, done };
  }, [d, categories, today]);
  const since = couple.together_since || couple.anniversary;
  return (
    <section className="us-sec">
      <div className="us-sec-head"><h3 className="us-sec-title">Our story 💛</h3><p className="us-sec-hint">All-time keepsakes — the filters below never touch these.</p></div>
      <div className="forever">
        <div className="f-stat"><div className="v"><Count n={stats.saved} prefix="Rs " /></div><div className="k">saved together <small style={{ display: "block", fontWeight: 600, opacity: .75 }}>jars + what stayed under the soft caps</small></div></div>
        <div className="f-stat"><div className="v"><Count n={stats.longest} suffix=" days" /></div><div className="k">longest streak</div></div>
        <div className="f-stat"><div className="v"><Count n={stats.done} suffix=" 🎉" /></div><div className="k">goals completed</div></div>
        <div className="f-stat"><div className="v">{since ? format(fromKey(since), "MMM d, yyyy") : "—"}</div><div className="k">together since 💛</div></div>
      </div>
    </section>
  );
}
function Count({ n, prefix = "", suffix = "" }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setV(n); return; }
    const t0 = performance.now(); let raf;
    const tick = (t) => { const k = Math.min(1, (t - t0) / 1100), e = 1 - Math.pow(1 - k, 3); setV(Math.round(n * e)); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [n]);
  return prefix + v.toLocaleString("en-PK") + suffix;
}

/* ② the picked stretch */
function MoneyPicture({ d, f, setF, today, mode, setMode, whoF, setWhoF }) {
  const { me, partner, categories, who, letterOf } = useDuo();
  const spend = mode === "spend";
  const { lo, hi } = filterRange(f, today);
  const src = spend ? d.entries.filter((e) => e.kind === "expense") : d.contribs;
  const list = src.filter((x) => x.k >= lo && x.k <= hi && (whoF === "all" || x.user_id === whoF));
  const total = list.reduce((s, x) => s + Number(x.amount), 0);
  const zTot = list.filter((x) => x.user_id === me.id).reduce((s, x) => s + Number(x.amount), 0), hTot = total - zTot;
  const eyebrow = f.mode === "month" ? format(fromKey(f.month + "-01"), "MMMM yyyy") : filterLabel(f, today);
  let label = filterLabel(f, today);
  if (whoF !== "all") label += ` · just ${whoF === me.id ? me.display_name : partner?.display_name}`;
  if (!spend) label += " · saved";

  // vs last month — whole months, couple view only (the no-fight rule); like-for-like up to today's day
  let delta = null;
  if (!list.length) delta = spend ? "nothing logged here — a quiet stretch 🌿" : "no savings in this stretch — the jars are patient 🫙";
  else if (whoF === "all" && f.mode === "month") {
    const cur = f.month === today.slice(0, 7), upto = cur ? Number(today.slice(8)) : 31;
    const pm = format(subMonths(fromKey(f.month + "-01"), 1), "yyyy-MM");
    const prev = src.filter((x) => x.k.startsWith(pm) && Number(x.k.slice(8)) <= upto).reduce((s, x) => s + Number(x.amount), 0);
    if (prev > 0 || total > 0) {
      const diff = spend ? prev - total : total - prev;
      const vs = format(fromKey(pm + "-01"), "MMMM") + (cur ? " at this point" : "");
      delta = diff >= 0 ? `${fmt(diff)} ${spend ? "less" : "more"} than ${vs} 🎉` : `${fmt(-diff)} ${spend ? "more" : "less"} than ${vs} — still a team 💛`;
    }
  }
  // category / jar cards, biggest first
  const byKey = {};
  list.forEach((x) => { const k = spend ? x.category_id || "other" : x.goal_id; const b = (byKey[k] = byKey[k] || { amt: 0 }); b.amt += Number(x.amount); });
  const rows = Object.keys(byKey).map((k) => {
    if (spend) { const c = categories.find((x) => x.id === k) || { name: "Other", emoji: "🌀" }; return { k, name: c.name, e: c.emoji, c: CAT_COLORS[c.name] || CAT_COLORS.Other, amt: byKey[k].amt }; }
    const g = d.goals.find((x) => x.id === k) || { name: "a jar", emoji: "🫙", color: "var(--sky)" }; return { k, name: g.name, e: g.emoji, c: g.color, amt: byKey[k].amt };
  }).sort((a, b) => b.amt - a.amt);
  const trendFor = (catId) => {
    if (!spend || whoF !== "all" || f.mode !== "month") return "";
    const cur = f.month === today.slice(0, 7), upto = cur ? Number(today.slice(8)) : 31;
    const pm = format(subMonths(fromKey(f.month + "-01"), 1), "yyyy-MM");
    const c = src.filter((x) => (x.category_id || "other") === catId && x.k.startsWith(f.month) && Number(x.k.slice(8)) <= upto).reduce((s, x) => s + Number(x.amount), 0);
    const p = src.filter((x) => (x.category_id || "other") === catId && x.k.startsWith(pm) && Number(x.k.slice(8)) <= upto).reduce((s, x) => s + Number(x.amount), 0);
    if (!p) return c ? "new" : ""; const pct = Math.round(((c - p) / p) * 100); return pct === 0 ? "— same" : (pct > 0 ? "↑ " : "↓ ") + Math.abs(pct) + "%";
  };
  return (
    <section className="us-sec">
      <div className="us-sec-head">
        <div className="us-eyebrow">{eyebrow}</div><h3 className="us-sec-title">The money picture 💸</h3>
        <p className="us-sec-hint">Pick a stretch and whose {spend ? "spending" : "saving"} — the chips shape this section only.</p>
      </div>
      <MonthFilter value={f} onChange={setF} today={today} extra={<>
        <div className="f-group">
          <button className={"fchip" + (spend ? " active" : "")} onClick={() => setMode("spend")}>💸 Spending</button>
          <button className={"fchip" + (!spend ? " active" : "")} onClick={() => setMode("save")}>🫙 Savings</button>
        </div>
        <div className="f-group" style={{ order: 3 }}>
          <button className={"fchip" + (whoF === "all" ? " active" : "")} onClick={() => setWhoF("all")}>Both 💛</button>
          <button className={"fchip" + (whoF === me.id ? " active" : "")} onClick={() => setWhoF(me.id)}>{me.display_name}</button>
          {partner && <button className={"fchip" + (whoF === partner.id ? " active" : "")} onClick={() => setWhoF(partner.id)}>{partner.display_name}</button>}
        </div></>} />
      <div className="money-grid">
        <div className="us-head">
          <div className="m-label">{label}</div>
          <div className="m-total">{fmt(total)}</div>
          {delta && <div className="m-delta">{delta}</div>}
          <div className="split-pie"><Donut parts={whoF === "all" && total > 0 ? [zTot > 0 && { share: zTot / total, pct: Math.round(zTot / total * 100), fill: "var(--you)", name: letterOf(me.id), tip: `${me.display_name} — ${fmt(zTot)}` }, hTot > 0 && { share: hTot / total, pct: 100 - Math.round(zTot / total * 100), fill: "url(#usHatch)", name: letterOf(partner?.id), tip: `${partner?.display_name} — ${fmt(hTot)}` }].filter(Boolean)
            : total > 0 ? [{ share: 1, pct: 100, fill: whoF === me.id ? "var(--you)" : "url(#usHatch)", name: "", tip: fmt(total) }] : []} /></div>
          <div className="split-legend">{total > 0 && whoF === "all" ? <><span><b className="y">{me.display_name}</b> {fmt(zTot)}</span>{partner && <span><b className="h">{partner.display_name}</b> {fmt(hTot)}</span>}</>
            : total > 0 ? <span><b className={whoF === me.id ? "y" : "h"}>{whoF === me.id ? me.display_name : partner?.display_name}</b> {fmt(total)} · {list.length} {list.length === 1 ? "entry" : "entries"}</span> : <span>nothing in this view 🌿</span>}</div>
        </div>
        <div className="cat-list">
          <h4>{spend ? "Where it went" : "Which jar it filled 🫙"}</h4>
          <div className="cat-grid">
            {!rows.length && <div className="dp-empty" style={{ gridColumn: "1/-1" }}><span className="leaf">{spend ? "🌿" : "🫙"}</span>no {spend ? "spending" : "savings"} in this view</div>}
            {rows.map((r, idx) => { const share = Math.round((r.amt / total) * 100), trend = trendFor(r.k); return (
              <div className="cat-card" key={r.k} style={{ background: `color-mix(in srgb, ${r.c} 13%, var(--card))`, animationDelay: idx * 70 + "ms" }}>
                {idx === 0 && <span className="cc-crown">👑</span>}{trend && <span className="cc-trend">{trend}</span>}
                <div className="cc-ring" style={{ background: `conic-gradient(${r.c} ${share}%, var(--chip) 0)` }}><div className="cc-emoji">{r.e}</div></div>
                <div className="cc-name">{r.name}</div><div className="cc-amt">{fmt(r.amt)}</div><div className="cc-share">{share}% of it all</div>
              </div>); })}
          </div>
        </div>
      </div>
    </section>
  );
}

/** neutral person donut — two slices, direct labels, one hatched so colour is never the only cue */
function Donut({ parts }) {
  const ref = useRef();
  useEffect(() => {
    const box = ref.current; if (!box || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const TAU = 2 * Math.PI * 40, marks = [...box.querySelectorAll("path, circle")];
    marks.forEach((el) => { const len = el.tagName === "circle" ? TAU : el.getTotalLength(); el._len = len; el.style.strokeDasharray = `${len} ${len}`; el.style.strokeDashoffset = len; el.style.transition = "none"; });
    marks.forEach((el) => void getComputedStyle(el).strokeDashoffset);
    let delay = 0;
    marks.forEach((el) => { const dur = Math.max(0.3, (el._len / TAU) * 0.9); el.style.transition = `stroke-dashoffset ${dur.toFixed(2)}s cubic-bezier(.33,1,.5,1) ${delay.toFixed(2)}s`; el.style.strokeDashoffset = 0; delay += dur * 0.85; });
  }, [JSON.stringify(parts)]);
  if (!parts.length) return null;
  const CX = 100, CY = 62, R = 40, SW = 15, GAP = 5;
  const at = (deg, r) => ({ x: CX + r * Math.sin((deg * Math.PI) / 180), y: CY - r * Math.cos((deg * Math.PI) / 180) });
  let a = 0;
  return (
    <svg ref={ref} viewBox="0 0 200 128" role="img" aria-label="who spent what">
      <defs><pattern id="usHatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--him)" /><line x1="1" y1="0" x2="1" y2="6" stroke="rgba(255,253,246,.5)" strokeWidth="2" /></pattern></defs>
      {parts.length === 1 ? <circle cx={CX} cy={CY} r={R} fill="none" stroke={parts[0].fill} strokeWidth={SW} transform={`rotate(-90 ${CX} ${CY})`}><title>{parts[0].tip}</title></circle>
        : parts.map((p, i) => { const sweep = p.share * 360, a0 = a + GAP / 2, a1 = a + sweep - GAP / 2, mid = a + sweep / 2; const s = at(a0, R), e = at(a1, R), t = at(mid, R + SW / 2 + 7); a += sweep; return (
          <g key={i}><path d={`M ${s.x.toFixed(1)} ${s.y.toFixed(1)} A ${R} ${R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${e.x.toFixed(1)} ${e.y.toFixed(1)}`} fill="none" stroke={p.fill} strokeWidth={SW}><title>{p.tip}</title></path>
            <text x={t.x.toFixed(1)} y={(t.y + 4).toFixed(1)} textAnchor={mid < 180 ? "start" : "end"} fontSize="12" fontWeight="800" fill="var(--ink-soft)">{p.name} {p.pct}%</text></g>); })}
      <text x={CX} y={CY + 7} textAnchor="middle" fontSize="19">💛</text>
    </svg>
  );
}

/* budgets-lite — quiet caps, information not alarms */
function Budgets({ d, today }) {
  const { supabase, categories, toast } = useDuo();
  const [open, setOpen] = useState(false);
  const m = today.slice(0, 7);
  const spentOf = (id) => d.entries.filter((e) => e.kind === "expense" && e.category_id === id && e.k.startsWith(m)).reduce((s, e) => s + Number(e.amount), 0);
  const capped = categories.filter((c) => c.monthly_cap && !c.archived);
  return (
    <section className="us-sec">
      <div className="us-sec-head"><div className="us-eyebrow">{format(fromKey(today), "MMMM")}</div><h3 className="us-sec-title">Soft caps 🌿</h3><p className="us-sec-hint">Gentle monthly ceilings per category — quiet bars, never alarms. Staying under counts as saved together.</p></div>
      <div className="settings-card">
        {!capped.length && !open && <div className="scrap-empty">no caps set — that's allowed 💛</div>}
        {(open ? categories.filter((c) => !c.archived) : capped).map((c) => { const spent = spentOf(c.id), cap = Number(c.monthly_cap || 0), pct = cap ? Math.min(100, Math.round((spent / cap) * 100)) : 0; return (
          <div className="cap-row" key={c.id} style={{ flexWrap: "wrap" }}>
            <span className="mcat" style={{ background: c.color }}>{c.emoji}</span>
            <span className="name">{c.name}<div style={{ fontSize: 12, color: "var(--ink-soft)", fontWeight: 600 }}>{cap ? `${fmt(spent)} of ${fmt(cap)}${spent <= cap ? " · room to breathe" : " · a little over — it happens"}` : fmt(spent) + " this month"}</div></span>
            {open ? <input type="number" inputMode="numeric" placeholder="cap (Rs)" defaultValue={c.monthly_cap ? Math.round(c.monthly_cap) : ""} min="0" onBlur={async (e) => { const v = parseAmount(e.target.value); const { error } = await supabase.from("categories").update({ monthly_cap: v ?? null }).eq("id", c.id); if (error) toast("couldn't save that cap — " + error.message); }} />
              : cap ? <span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{pct}%</span> : null}
            {cap > 0 && <div className="cap-bar" style={{ flexBasis: "100%" }}><div style={{ width: pct + "%", background: spent <= cap ? "var(--sage)" : "var(--butter-deep)" }} /></div>}
          </div>); })}
        <button className="ghost-btn" onClick={() => setOpen(!open)}>{open ? "done ✓" : "✏️ set or change caps"}</button>
      </div>
    </section>
  );
}

/* ③ last month — the recap envelope, cached in `recaps`, regenerated if an entry in that month was edited later */
function Recap({ d, today }) {
  const { supabase, couple, categories } = useDuo();
  const lastM = format(subMonths(fromKey(today.slice(0, 7) + "-01"), 1), "yyyy-MM");
  const prevM = format(subMonths(fromKey(lastM + "-01"), 1), "yyyy-MM");
  const recap = useMemo(() => {
    const inM = (k) => k.startsWith(lastM), inP = (k) => k.startsWith(prevM);
    const byMonth = {}; d.contribs.filter((c) => c.k < lastM).forEach((c) => { byMonth[c.k.slice(0, 7)] = (byMonth[c.k.slice(0, 7)] || 0) + Number(c.amount); });
    return buildRecap({ monthKey: lastM, entries: d.entries.filter((e) => inM(e.k)), prevEntries: d.entries.filter((e) => inP(e.k)), contribs: d.contribs.filter((c) => inM(c.k)), prevContribs: d.contribs.filter((c) => inP(c.k)),
      categories, goals: d.goals, bestContribBefore: Math.max(0, ...Object.values(byMonth)) });
  }, [d, lastM, categories]);
  const wrote = useRef(0);
  useEffect(() => {
    // cache so the envelope is stable; regenerate when an entry from that month was edited after the last generation.
    // `recaps` has no realtime feed, so remember our own write — otherwise every event re-upserts against stale data.
    const cached = d.recaps.find((r) => r.month === lastM + "-01");
    const latestEdit = d.entries.filter((e) => e.k.startsWith(lastM)).reduce((m, e) => Math.max(m, new Date(e.updated_at).getTime()), 0);
    const knownGen = Math.max(wrote.current, cached ? new Date(cached.generated_at).getTime() : 0);
    if ((!cached && !wrote.current) || knownGen < latestEdit) {
      wrote.current = Date.now();
      supabase.from("recaps").upsert({ couple_id: couple.id, month: lastM + "-01", payload: recap, generated_at: new Date(wrote.current).toISOString() }).then(() => {});
    }
  }, [recap]);
  const name = format(fromKey(lastM + "-01"), "MMMM");
  return (
    <section className="us-sec">
      <div className="us-sec-head"><div className="us-eyebrow">Last month</div><h3 className="us-sec-title">The recap card 💌</h3><p className="us-sec-hint">Written from last month's entries the first time either of you opens Us in a new month — open it together.</p></div>
      <details className="recap-fold">
        <summary><span className="rf-ico">💌</span><span className="rf-closed">Open {name}'s recap</span><span className="rf-open">Tuck it back in 💛</span></summary>
        <div className="recap">
          <div className="stamp">{name} recap</div>
          <h4>Last month, together:</h4>
          <ul>
            <li>Spent <b>{fmt(recap.total)}</b>{recap.topCat && <> · top category <b>{recap.topCat.name} {recap.topCat.emoji}</b></>}</li>
            {recap.biggest && <li>Biggest single: <b>{fmt(recap.biggest.amount)}</b>{recap.biggest.note ? ` — ${recap.biggest.note}` : ` — ${recap.biggest.category}`}</li>}
            {recap.goalLines.map((g) => <li key={g.name}>Added <b>{fmt(g.amount)}</b> to {g.name} {g.emoji}</li>)}
            {recap.moments > 0 && <li>{recap.moments} {recap.moments === 1 ? "moment" : "moments"} kept ✨</li>}
          </ul>
          <div className="cheer">{recap.cheer}</div>
        </div>
      </details>
    </section>
  );
}

/* profile + couple settings */
function Settings() {
  const { supabase, me, partner, couple, reload, toast, theme, flipTheme, categories } = useDuo();
  const router = useRouter();
  const [name, setName] = useState(me.display_name); const [color, setColor] = useState(me.avatar_color);
  const [armed, setArmed] = useState(null); // 'leave' | 'delete'
  const [tzPending, setTzPending] = useState(null);
  const nameRef = useRef(); const fileRef = useRef();
  // a realtime `profiles` event must not wipe what's being typed right now
  useEffect(() => { if (document.activeElement !== nameRef.current) setName(me.display_name); setColor(me.avatar_color); }, [me]);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(null), 6000); return () => clearTimeout(t); }, [armed]);
  const saveProfile = async (patch) => { const { error } = await supabase.from("profiles").update(patch).eq("id", me.id); if (error) toast(error.message); else { reload(); } };
  const saveCouple = async (patch) => { const { error } = await supabase.from("couples").update(patch).eq("id", couple.id); if (error) toast(error.message); else reload(); };
  async function pickPhoto(e) {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      // new object name each time (old URL caches can't show a stale face), then the previous file is tidied away
      const p = await uploadPhoto(supabase, "avatars", freshPath(me.id, "avatar"), f);
      await saveProfile({ avatar_url: p });
      if (me.avatar_url && me.avatar_url !== p) removeQuietly(supabase, "avatars", me.avatar_url);
    } catch (err) { toast(err?.message?.includes("format") ? err.message : "that photo didn't upload 💛"); }
  }
  async function leave() {
    if (armed !== "leave") { setArmed("leave"); return; }
    const { error } = await supabase.rpc("leave_couple");
    if (error) return toast("couldn't leave — " + error.message);
    await reload(); router.replace("/onboarding");
  }
  async function deleteAccount() {
    if (armed !== "delete") { setArmed("delete"); return; }
    const { error } = await supabase.rpc("delete_account");
    if (error) return toast("couldn't delete — " + error.message);
    await signOutClean(supabase); router.replace("/"); router.refresh();
  }
  async function signOut() { await signOutClean(supabase); router.replace("/login"); router.refresh(); }
  // changing the timezone re-buckets every entry's "day" (streaks, day totals, calendars) — confirm before it lands
  function pickTz(v) { if (v === couple.timezone) return; if (tzPending !== v) { setTzPending(v); return; } setTzPending(null); saveCouple({ timezone: v }); }
  const tzs = ["Asia/Karachi", "Asia/Dubai", "Asia/Kolkata", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Australia/Sydney"];
  return (
    <section className="us-sec" id="settings">
      <div className="us-sec-head"><div className="us-eyebrow">Settings</div><h3 className="us-sec-title">You & your Duo ⚙️</h3></div>
      <div className="settings-card">
        <h4>You</h4>
        <div className="settings-row"><span className="k">name</span><input ref={nameRef} className="note-input" style={{ width: 180, marginBottom: 0 }} value={name} maxLength={24} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name.trim() !== me.display_name && saveProfile({ display_name: name.trim() })} /></div>
        <div className="settings-row"><span className="k">colour</span><div className="swatch-row" style={{ margin: 0 }}>{SWATCHES.map((s) => <button key={s.key} className={"swatch" + (color === s.main ? " sel" : "")} style={{ background: s.main, width: 30, height: 30 }} onClick={() => { setColor(s.main); saveProfile({ avatar_color: s.main }); }} aria-label={s.key} />)}</div></div>
        <div className="settings-row"><span className="k">photo</span><span style={{ display: "flex", alignItems: "center", gap: 10 }}><div className="avatar you" style={{ width: 34, height: 34 }}>{me.avatar_url ? <Photo bucket="avatars" path={me.avatar_url} /> : name.charAt(0)}</div><button className="link-btn" onClick={() => fileRef.current?.click()}>change</button><input ref={fileRef} type="file" accept="image/*" hidden onChange={pickPhoto} /></span></div>
        <div className="settings-row"><span className="k">theme</span><button className="link-btn" onClick={flipTheme}>{theme === "dark" ? "☀️ switch to light" : "🌙 switch to dark"}</button></div>
        <div className="settings-row"><span className="k">cycle sharing</span><button className={"cyc-share" + (me.cycle_shared ? " on" : "")} style={{ margin: 0 }} onClick={() => saveProfile({ cycle_shared: !me.cycle_shared })}>{me.cycle_shared ? `sharing with ${partner?.display_name || "them"} ` : "just for me "}<span className="sw" /></button></div>
      </div>
      <div className="settings-card">
        <h4>Your Duo {partner ? `· ${me.display_name} & ${partner.display_name}` : ""}</h4>
        <div className="settings-row"><span className="k">together since</span><input type="date" defaultValue={couple.together_since || ""} onChange={(e) => saveCouple({ together_since: e.target.value || null })} /></div>
        <div className="settings-row"><span className="k">anniversary <small style={{ display: "block", fontWeight: 600, opacity: .7 }}>marked every month on the calendar; the yearly one gets its name</small></span><input type="date" defaultValue={couple.anniversary || ""} onChange={(e) => saveCouple({ anniversary: e.target.value || null })} /></div>
        <div className="settings-row" style={{ flexWrap: "wrap" }}><span className="k">timezone (what "today" means)</span><select className="note-input" style={{ width: 200, marginBottom: 0 }} value={tzPending || couple.timezone} onChange={(e) => pickTz(e.target.value)}>{[couple.timezone, ...tzs].filter((v, i, a) => a.indexOf(v) === i).map((t) => <option key={t}>{t}</option>)}</select>
          {tzPending && <div className="kind-msg" style={{ flexBasis: "100%" }}>this moves every entry's "day" for both of you — streaks and day totals shift. <button className="link-btn" onClick={() => pickTz(tzPending)}>yes, switch to {tzPending}</button> · <button className="link-btn" onClick={() => setTzPending(null)}>keep {couple.timezone}</button></div>}
        </div>
        {!partner && <div className="settings-row"><span className="k">your person</span><button className="link-btn" onClick={() => router.push("/waiting")}>invite them →</button></div>}
      </div>
      <Categories categories={categories} />
      <div className="settings-card">
        <h4>Account</h4>
        <div className="settings-row"><span className="k">this device</span><button className="link-btn" onClick={signOut}>sign out</button></div>
        <div className="settings-row" style={{ flexWrap: "wrap" }}><span className="k">this Duo</span><button className="link-btn" onClick={leave} style={{ color: "var(--ink-soft)" }}>{armed === "leave" ? "yes, leave 🥺" : "leave this Duo"}</button>
          {armed === "leave" && <div className="kind-msg" style={{ flexBasis: "100%" }}>{copy.leaveWarn}</div>}</div>
        <div className="settings-row" style={{ flexWrap: "wrap" }}><span className="k">my account</span><button className="link-btn" onClick={deleteAccount} style={{ color: "var(--ink-soft)" }}>{armed === "delete" ? "yes, delete my account" : "delete my account"}</button>
          {armed === "delete" && <div className="kind-msg" style={{ flexBasis: "100%" }}>{copy.deleteWarn}</div>}</div>
      </div>
    </section>
  );
}

/* categories — add, rename, re-emoji, archive (archived ones keep their history, just leave the chips) */
function Categories({ categories }) {
  const { supabase, couple, toast } = useDuo();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(""); const [emoji, setEmoji] = useState("🌀");
  const write = async (q, what) => { const { error } = await q; if (error) toast(`couldn't ${what} — ${error.message}`); };
  const live = categories.filter((c) => !c.archived), gone = categories.filter((c) => c.archived);
  async function add() {
    const t = name.trim(); if (!t) return;
    await write(supabase.from("categories").insert({ couple_id: couple.id, name: t.slice(0, 20), emoji: (emoji || "🌀").slice(0, 4), color: "#EDE7DE", sort: categories.length }), "add that category");
    setName(""); setEmoji("🌀");
  }
  return (
    <div className="settings-card">
      <h4>Categories 🏷 <button className="link-btn" style={{ marginLeft: 8 }} onClick={() => setOpen(!open)}>{open ? "done ✓" : "edit"}</button></h4>
      {!open ? <div className="chip-row">{live.map((c) => <span key={c.id} className="chip">{c.emoji} {c.name}</span>)}</div> : (
        <>
          {live.map((c) => (
            <div className="settings-row" key={c.id} style={{ gap: 6 }}>
              <input className="note-input" style={{ width: 52, marginBottom: 0, textAlign: "center" }} defaultValue={c.emoji} maxLength={4} aria-label="emoji" onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.emoji) write(supabase.from("categories").update({ emoji: v }).eq("id", c.id), "change the emoji"); }} />
              <input className="note-input" style={{ flex: 1, marginBottom: 0 }} defaultValue={c.name} maxLength={20} aria-label="name" onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.name) write(supabase.from("categories").update({ name: v }).eq("id", c.id), "rename it"); }} />
              <button className="link-btn" style={{ color: "var(--ink-soft)" }} onClick={() => write(supabase.from("categories").update({ archived: true }).eq("id", c.id), "archive it")}>archive</button>
            </div>
          ))}
          <div className="settings-row" style={{ gap: 6 }}>
            <input className="note-input" style={{ width: 52, marginBottom: 0, textAlign: "center" }} value={emoji} maxLength={4} aria-label="emoji for the new category" onChange={(e) => setEmoji(e.target.value)} />
            <input className="note-input" style={{ flex: 1, marginBottom: 0 }} placeholder="new category…" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
            <button className="link-btn" onClick={add} disabled={!name.trim()}>add</button>
          </div>
          {gone.length > 0 && <div className="tiny">archived (history kept): {gone.map((c) => <button key={c.id} className="link-btn" onClick={() => write(supabase.from("categories").update({ archived: false }).eq("id", c.id), "bring it back")}>{c.emoji} {c.name} ↺</button>)}</div>}
        </>
      )}
    </div>
  );
}
