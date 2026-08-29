"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addMonths, addYears, differenceInCalendarDays, format, subDays } from "date-fns";
import { useDuo, useLive, must, LoadError } from "@/components/DuoProvider";
import Sheet from "@/components/Sheet";
import Photo from "@/components/Photo";
import { heartPop } from "@/components/Confetti";
import { fmt, dayKey, todayKey, fromKey, keyOf, greeting, dayNumber, ago } from "@/lib/format";
import { MOODS } from "@/lib/palette";
import { copy } from "@/lib/copy";
import { uploadPhoto, freshPath, removeQuietly } from "@/lib/photos";
import { buildModel, cycleInfo, PHASES } from "@/lib/cycle";

const DAYS_BACK = 70;

export default function TodayPage() {
  const { supabase, me, partner, couple, tz, toast } = useDuo();
  const router = useRouter();
  const [greet, setGreet] = useState("Hello, you two 💛");
  useEffect(() => { setGreet(greeting(tz)); }, [tz]);
  const today = todayKey(tz);
  // one stable window per day — a fresh ISO string on every render would be a silent dependency
  const since = useMemo(() => subDays(fromKey(today), DAYS_BACK).toISOString(), [today]);

  const [d, refresh, error] = useLive(["entries", "checkins", "answers", "goals", "goal_contributions", "calendar_marks", "notes", "cycles", "profiles", "pings"], async () => {
    if (!couple) return null;
    const [entries, streakDays, checkins, streaks, answers, questions, goals, contribs, marks, notes, cycles, pings] = await Promise.all([
      supabase.from("entries").select("*").eq("couple_id", couple.id).gte("happened_at", since).order("happened_at", { ascending: false }),
      supabase.from("entries").select("happened_at").eq("couple_id", couple.id).order("happened_at", { ascending: false }).limit(5000),
      supabase.from("checkins").select("*").eq("couple_id", couple.id).eq("day", today),
      supabase.rpc("checkin_streaks"), // both streaks, computed where all rows are visible (RLS hides the partner's days from us)
      supabase.from("answers").select("*").eq("couple_id", couple.id).eq("day", today),
      supabase.from("questions").select("id,text").order("id"),
      supabase.from("goals").select("*").eq("couple_id", couple.id).order("sort").order("created_at"),
      supabase.from("goal_contributions").select("*").eq("couple_id", couple.id),
      supabase.from("calendar_marks").select("*").eq("couple_id", couple.id),
      supabase.from("notes").select("*").eq("couple_id", couple.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("cycles").select("*").eq("couple_id", couple.id),
      supabase.from("pings").select("*").eq("couple_id", couple.id).gte("created_at", new Date(Date.now() - 36 * 3600000).toISOString()).order("created_at", { ascending: false }).limit(5),
    ]);
    return { entries: must(entries), streakDays: must(streakDays), checkins: must(checkins), streaks: must(streaks), answers: must(answers), questions: must(questions),
      goals: must(goals), contribs: must(contribs), marks: must(marks), notes: must(notes), cycles: must(cycles), pings: must(pings) };
  }, [today]);

  const [ciOpen, setCiOpen] = useState(false);
  const [pingTxt, setPingTxt] = useState(copy.pingBtn);

  const view = useMemo(() => {
    if (!d) return null;
    const T = fromKey(today);
    const isToday = (ts) => dayKey(ts, tz) === today;
    const todayExp = d.entries.filter((e) => e.kind === "expense" && isToday(e.happened_at));
    const spent = todayExp.reduce((s, e) => s + Number(e.amount), 0);
    const mine = todayExp.filter((e) => e.user_id === me.id).reduce((s, e) => s + Number(e.amount), 0);
    const savedToday = d.contribs.filter((c) => isToday(c.created_at)).reduce((s, c) => s + Number(c.amount), 0);
    // logging streak — consecutive days (couple tz) with ≥1 entry by either partner (full history, not the feed window)
    const days = new Set(d.streakDays.map((e) => dayKey(e.happened_at, tz)));
    let streak = 0, cur = days.has(today) ? T : subDays(T, 1);
    while (days.has(keyOf(cur))) { streak++; cur = subDays(cur, 1); }
    const streakOf = (uid) => d.streaks.find((s) => s.user_id === uid)?.streak || 0;
    const myCi = d.checkins.find((c) => c.user_id === me.id) || null;
    const theirCi = partner ? d.checkins.find((c) => c.user_id === partner.id) || null : null;
    // question of the day: a rotation, not a hash — no repeats until the whole pool has been asked
    const q = d.questions.length ? d.questions[dayNumber(today) % d.questions.length] : null;
    const myA = d.answers.find((a) => a.user_id === me.id) || null;
    const theirA = partner ? d.answers.find((a) => a.user_id === partner.id) || null : null;
    // countdowns
    const cds = [];
    const push = (emoji, label, date) => { const n = differenceInCalendarDays(date, T); if (n >= 0 && n <= 400) cds.push({ emoji, label, n, date }); };
    d.marks.forEach((m) => {
      const base = fromKey(m.day);
      let dt = base;
      // add k periods to the ORIGINAL date each time — compounding addMonths turns Jan 31 into the 28th forever
      if (m.recurs === "monthly") { for (let k = 1; dt < T; k++) dt = addMonths(base, k); }
      else if (m.recurs === "yearly") { for (let k = 1; dt < T; k++) dt = addYears(base, k); }
      push(m.emoji, m.label, dt);
    });
    if (couple.anniversary) {
      // the calendar marks "our day" every month; the countdown agrees — and calls the yearly one by its name
      const base = fromKey(couple.anniversary);
      let next = base; for (let k = 1; next < T; k++) next = addMonths(base, k);
      const yearly = next.getMonth() === base.getMonth() && next > base;
      const yrs = next.getFullYear() - base.getFullYear();
      push("💞", yearly ? `${yrs} ${yrs === 1 ? "year" : "years"} of us` : next.getTime() === base.getTime() ? "our anniversary" : "our day this month", next);
    }
    d.goals.filter((g) => g.target_date && !g.completed_at).forEach((g) => push(g.emoji, g.name, fromKey(g.target_date)));
    cds.sort((a, b) => a.n - b.n);
    // jars
    const savedBy = {}; d.contribs.forEach((c) => { savedBy[c.goal_id] = (savedBy[c.goal_id] || 0) + Number(c.amount); });
    const jars = d.goals.map((g) => ({ ...g, saved: savedBy[g.id] || 0, pct: Math.min(100, Math.round((savedBy[g.id] || 0) / Number(g.target_amount) * 100)) }));
    const teaser = partner ? d.notes.find((n) => n.user_id === partner.id) : null;
    // partner's cycle, if she shares
    let cyc = null;
    if (partner) { const rows = d.cycles.filter((c) => c.user_id === partner.id); if (rows.length) { const m = buildModel(rows); const info = cycleInfo(T, m); if (info) cyc = { info, meta: PHASES[info.phase] }; } }
    const lastPing = partner ? d.pings.find((p) => p.from_user === partner.id) || null : null;
    return { spent, mine, savedToday, streak, myCi, theirCi, myStreak: streakOf(me.id), theirStreak: partner ? streakOf(partner.id) : 0, q, myA, theirA, cds: cds.slice(0, 4), jars, teaser, cyc, lastPing };
  }, [d, today, me?.id, partner?.id]);

  async function ping(e) {
    heartPop(e.currentTarget);
    const { error } = await supabase.from("pings").insert({ couple_id: couple.id, from_user: me.id });
    setPingTxt(error ? "that didn't send — try again 💛" : copy.pingSent(partner?.display_name || "they"));
    setTimeout(() => setPingTxt(copy.pingBtn), 2400);
  }

  if (!view) return <><div className="greeting">{greet}</div><LoadError error={error} onRetry={refresh} what="today" /></>;
  const pName = partner?.display_name || "your person";
  const first = (s) => (s || "?").trim().split(" ")[0];

  return (
    <>
      <div className="greeting">{greet}</div>
      <div className="date-line">{format(fromKey(today), "EEEE, d MMMM yyyy")}</div>
      <LoadError error={error} onRetry={refresh} what="the latest" />
      {view.lastPing && <div className="q-hidden" style={{ marginBottom: 10 }}>{copy.pingFrom(first(pName), ago(view.lastPing.created_at))}</div>}

      <div className="today-grid">
        <div className="col-side">
          <div className="checkin">
            <h4>Us, today 📸</h4>
            <div className="ci-frames">
              {/* partner */}
              <div className="ci-col">
                <div className="ci-name" style={{ color: "var(--him-text)" }}>{partner ? first(pName) : "them"} today</div>
                <div className={"ci-ringwrap" + (view.theirStreak > 0 && view.theirCi ? " lit" : "")}>
                  <button className={"ci-frame" + (view.theirCi ? "" : " blurred")} id="hFrame"
                    aria-label={view.theirCi ? `${pName}'s check-in for today` : `${pName}'s check-in — blurred until you add yours`}
                    onClick={(e) => (view.myCi ? heartPop(e.currentTarget) : partner && setCiOpen(true))}>
                    {view.theirCi ? (
                      <div className="ci-photo" style={{ background: "linear-gradient(150deg,var(--sage),var(--sky))" }}>
                        {view.theirCi.photo_path ? <Photo bucket="checkins" path={view.theirCi.photo_path} /> : view.theirCi.mood}
                      </div>
                    ) : (
                      <div className="ci-photo" style={{ background: "linear-gradient(150deg,var(--sage),var(--sky))" }}>😶‍🌫️</div>
                    )}
                    {!view.theirCi && <div className="ci-lock"><span className="lk">🙈</span>{partner ? (view.myCi ? "not posted yet" : copy.checkInLock) : "waiting for them"}</div>}
                    {view.theirCi?.mood && view.theirCi.photo_path && <span className="ci-mood">{view.theirCi.mood}</span>}
                  </button>
                </div>
                <div className="ci-cap">{view.theirCi ? (view.theirCi.note ? `“${view.theirCi.note}”` : "checked in ✓") : "· · ·"}</div>
                <div className="ci-streak">{view.theirStreak ? `🔥 ${view.theirStreak}-day streak` : " "}</div>
              </div>
              {/* me */}
              <div className="ci-col">
                <div className="ci-name" style={{ color: "var(--you-text)" }}>{first(me.display_name)} today</div>
                <div className={"ci-ringwrap" + (view.myCi ? " lit" : "")}>
                  <button className="ci-frame" id="zFrame" aria-label={view.myCi ? "Your check-in for today — tap to change it" : "Add your check-in"} onClick={() => setCiOpen(true)}>
                    {view.myCi ? (
                      <div className="ci-photo" style={{ background: "linear-gradient(150deg,var(--peach),var(--butter))" }}>
                        {view.myCi.photo_path ? <Photo bucket="checkins" path={view.myCi.photo_path} /> : view.myCi.mood}
                      </div>
                    ) : (
                      <div className="ci-photo"><span className="ci-add-ico">＋</span><span className="ci-add-txt">add your today</span></div>
                    )}
                    {view.myCi?.mood && view.myCi.photo_path && <span className="ci-mood">{view.myCi.mood}</span>}
                  </button>
                </div>
                <div className="ci-cap">{view.myCi ? (view.myCi.note ? `“${view.myCi.note}”` : "checked in ✓") : " "}</div>
                {view.myStreak > 0 && <div className="ci-streak">🔥 {view.myStreak}-day streak</div>}
                {partner && <button className="ci-ping" onClick={ping}>{pingTxt}</button>}
              </div>
            </div>
          </div>

          <Qotd q={view.q} myA={view.myA} theirA={view.theirA} today={today} />
        </div>

        <div className="col-side">
          <div className="cd-strip">
            {view.cds.map((c, i) => <span key={i} className="cd-pill">{c.emoji} {c.label} · <b>{c.n === 0 ? "today 🎉" : c.n === 1 ? "tomorrow" : `in ${c.n} days`}</b></span>)}
            <Link href="/cal/fin" className="cd-pill add">＋ add a date</Link>
          </div>

          {view.cyc && (
            <button className="cyc-partner" onClick={() => router.push("/cycle")} aria-label={`${pName}'s cycle — see the cycle page`}>
              <span className="cp-emoji">🌸</span>
              <span className="cp-txt"><b>{first(pName)} · {view.cyc.meta.name.toLowerCase()} phase, day {view.cyc.info.day}</b><span>{view.cyc.meta.partner}</span></span>
              <span className="go">→</span>
            </button>
          )}

          <div className="hero-row">
            <div className="saved-card">
              <div className="label">Saved together · today</div>
              <div className="big"><CountUp n={view.savedToday} /></div>
              <div className="sub">{copy.savedToday(view.savedToday)}</div>
            </div>
            <div className="streak-card"><div className="fire">🔥</div><div className="num">{view.streak}</div><div className="lbl">day logging streak</div></div>
          </div>

          <button className="spent-card" onClick={() => router.push("/feed")} aria-label="Spent today — see it in our feed">
            <div className="row-top"><span className="label">Spent together · today</span><span className="go">our feed →</span></div>
            <div className="big"><CountUp n={view.spent} /></div>
            <div className="sub">{view.spent ? <>you <b>{fmt(view.mine)}</b> · {partner ? first(pName) : "them"} <b>{fmt(view.spent - view.mine)}</b></> : copy.spentNothing}</div>
          </button>

          <div className="glance">
            <h4>Our jars, at a glance 🎯</h4>
            {view.jars.length ? view.jars.map((g) => (
              <div className="g-row" key={g.id}>
                <div className="g-top"><span>{g.name} {g.emoji}</span><b>{g.pct}%</b></div>
                <div className="g-track"><div className="g-fill" style={{ background: g.color, width: g.pct + "%" }} /></div>
              </div>
            )) : <div className="scrap-empty">{copy.jarsEmpty} <Link href="/goals">→</Link></div>}
          </div>

          {view.teaser ? (
            <button className="note-teaser" onClick={() => router.push("/notes")}>
              <span className="from">{first(pName)} stuck a note</span>
              {view.teaser.kind === "list" ? `${view.teaser.title || "a list"} 🧺` : view.teaser.body}
              <span className="go">→ see the corkboard</span>
            </button>
          ) : !partner ? (
            <div className="empty-solo">solo mode for now — everything you log is waiting for them 💛 <Link href="/waiting">invite →</Link></div>
          ) : null}
        </div>
      </div>

      <CheckInSheet open={ciOpen} onClose={() => setCiOpen(false)} today={today} existing={view.myCi} />
    </>
  );
}

function CountUp({ n }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setV(n); return; }
    const t0 = performance.now(), dur = 1200, from = 0; let raf;
    const tick = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); setV(Math.round(from + (n - from) * e)); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [n]);
  return fmt(v);
}

function Qotd({ q, myA, theirA, today }) {
  const { supabase, me, partner, couple, toast } = useDuo();
  const [txt, setTxt] = useState("");
  const [busy, setBusy] = useState(false);
  if (!q) return null;
  const pName = partner?.display_name || "your person";
  async function send() {
    if (!txt.trim() || busy) return; setBusy(true);
    const { error } = await supabase.from("answers").upsert({ question_id: q.id, couple_id: couple.id, user_id: me.id, day: today, text: txt.trim() }, { onConflict: "couple_id,user_id,day" });
    setBusy(false);
    if (error) { toast?.("that answer didn't save — " + error.message); return; }
    setTxt("");
  }
  return (
    <div className="qotd">
      <div className="q-label">❓ question of the day</div>
      <div className="q-text">{q.text}</div>
      {!myA ? (
        <>
          <input className="note-input" placeholder="your answer…" maxLength={120} value={txt} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
          <button className="q-send" disabled={!txt.trim() || busy} onClick={send}>{partner ? `answer to reveal ${pName}'s 💛` : "answer 💛"}</button>
          <div className="q-hidden">{partner ? copy.qSolo : "your person will see it when they join 💛"}</div>
        </>
      ) : (
        <>
          <div className="q-bubble qb-you"><span className="qwho">{me.display_name}</span>{myA.text}</div>
          {theirA ? <div className="q-bubble qb-him" style={{ animationDelay: ".3s", animationFillMode: "backwards" }}><span className="qwho">{pName}</span>{theirA.text}</div>
            : partner ? <div className="q-hidden">{copy.qWaitPartner(pName)}</div> : null}
        </>
      )}
    </div>
  );
}

function CheckInSheet({ open, onClose, today, existing }) {
  const { supabase, me, couple, toast } = useDuo();
  const [mood, setMood] = useState(null); const [file, setFile] = useState(null); const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const cam = useRef(), gal = useRef();
  // editing today's check-in starts from what's already there
  useEffect(() => { if (open) { setMood(existing?.mood || null); setNote(existing?.note || ""); setFile(null); } }, [open, existing?.id]);
  useEffect(() => { if (!file) { setPreview(null); return; } const u = URL.createObjectURL(file); setPreview(u); return () => URL.revokeObjectURL(u); }, [file]);
  const canSave = !!(mood || file || existing?.photo_path);
  async function save() {
    if (!canSave || busy) return; setBusy(true);
    try {
      const row = { couple_id: couple.id, user_id: me.id, day: today, note: note.trim() };
      if (mood || !existing) row.mood = mood; // never null out an earlier mood by accident
      if (file) {
        // a fresh object name per upload — the same path re-uploaded would be served stale for up to an hour
        row.photo_path = await uploadPhoto(supabase, "checkins", freshPath(`${couple.id}/${me.id}`, today), file);
      }
      // no new photo → leave photo_path out so a mood-only edit can't wipe an earlier photo
      const { error } = await supabase.from("checkins").upsert(row, { onConflict: "couple_id,user_id,day" });
      if (error) throw error;
      if (file && existing?.photo_path) removeQuietly(supabase, "checkins", existing.photo_path);
      // the check-in lands in the feed as a plain "checked in" moment — only the FIRST time that day, and WITHOUT
      // the mood or the note: those stay behind the blur until the other person has checked in too (RLS on checkins)
      if (!existing) {
        const { error: e2 } = await supabase.from("entries").insert({ couple_id: couple.id, user_id: me.id, kind: "moment", moment_emoji: "📸", moment_tag: "checked in", note: "", photo_path: null });
        if (e2) console.warn(e2);
      }
      setMood(null); setFile(null); setNote(""); onClose();
    } catch (e) { toast("that didn't save — " + (e.message || "try again")); }
    setBusy(false);
  }
  return (
    <Sheet open={open} onClose={onClose}>
      <h3 className="c-title">{me?.display_name}, today 📸{existing ? <small> · changing today's check-in</small> : null}</h3>
      {preview && <img className="ci-preview" src={preview} alt="your photo for today" />}
      <div className="photo-row">
        <button className={"photo-btn" + (file && file._src === "cam" ? " has" : "")} onClick={() => cam.current?.click()}>📷 take a photo</button>
        <button className={"photo-btn" + (file && file._src === "gal" ? " has" : "")} onClick={() => gal.current?.click()}>🖼 from gallery</button>
      </div>
      <input ref={cam} type="file" accept="image/*" capture="user" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) { f._src = "cam"; setFile(f); } }} />
      <input ref={gal} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) { f._src = "gal"; setFile(f); } }} />
      <div className="mood-row">{MOODS.map((m) => <button key={m} className={"mood-btn" + (mood === m ? " sel" : "")} onClick={() => setMood(m)}>{m}</button>)}</div>
      <input className="note-input" placeholder="one line about today… (optional)" maxLength={60} value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="save-btn" disabled={!canSave || busy} onClick={save}>{busy ? "posting…" : existing ? "Update my check-in 💛" : "Check in 💛"}</button>
    </Sheet>
  );
}
