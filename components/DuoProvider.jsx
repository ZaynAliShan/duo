"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { swatchFor } from "@/lib/palette";
import { initials } from "@/lib/format";

const Ctx = createContext(null);
export const useDuo = () => useContext(Ctx);

const LIVE_TABLES = ["profiles", "couples", "entries", "hearts", "pings", "checkins", "answers", "goals", "goal_contributions",
  "bucket_items", "notes", "list_items", "facts", "calendar_marks", "cycles", "cycle_logs", "categories"];

export function DuoProvider({ userId, children }) {
  const supabase = createClient();
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState(null);
  const [partner, setPartner] = useState(null);
  const [couple, setCouple] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState("light");
  const [toasts, setToasts] = useState([]);
  const listeners = useRef(new Set());
  const hadPartner = useRef(null);
  const confettiRef = useRef(null);
  const partnerName = useRef("your person");
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const { data: mine } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (seq !== loadSeq.current) return; // a newer load superseded this one
    setMe(mine || null);
    if (mine?.couple_id) {
      const [{ data: c }, { data: members }, { data: cats }] = await Promise.all([
        supabase.from("couples").select("*").eq("id", mine.couple_id).maybeSingle(),
        supabase.from("profiles").select("*").eq("couple_id", mine.couple_id),
        supabase.from("categories").select("*").eq("couple_id", mine.couple_id).order("sort"),
      ]);
      if (seq !== loadSeq.current) return;
      setCouple(c || null);
      const p = (members || []).find((m) => m.id !== userId) || null;
      partnerName.current = p?.display_name || "your person";
      setPartner(p);
      setCategories(cats || []);
      if (hadPartner.current === false && p) {
        toast("You're linked! 🎉");
        confettiRef.current?.();
      }
      hadPartner.current = !!p;
    } else {
      setCouple(null); setPartner(null); setCategories([]);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // theme: light is home base, dark is a choice
  useEffect(() => {
    let t = "light";
    try { t = localStorage.getItem("duo-theme") === "dark" ? "dark" : "light"; } catch {}
    setTheme(t);
  }, []);
  const flipTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("duo-theme", next); } catch {}
    if (me) supabase.from("profiles").update({ theme: next }).eq("id", me.id).then(() => {});
  };
  // avatar colours → the prototype's --you / --him tokens
  useEffect(() => {
    const root = document.documentElement.style;
    const dark = theme === "dark";
    const y = swatchFor(me?.avatar_color || "#E8846B");
    const h = swatchFor(partner?.avatar_color || (y.key === "sage" ? "#E8846B" : "#7FA477"));
    root.setProperty("--you", y.main); root.setProperty("--you-soft", dark ? y.darkSoft : y.soft); root.setProperty("--you-text", dark ? y.darkText : y.text);
    root.setProperty("--him", h.main); root.setProperty("--him-soft", dark ? h.darkSoft : h.soft); root.setProperty("--him-text", dark ? h.darkText : h.text);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? "#2B2119" : "#FFF7EA";
  }, [me?.avatar_color, partner?.avatar_color, theme]);

  // one realtime channel per couple; every page subscribes through `subscribe`
  useEffect(() => {
    if (!couple?.id) return;
    // unique topic per effect run: supabase.channel() reuses a same-named channel, and StrictMode's
    // double-invoke would otherwise hand us the one being torn down
    const ch = supabase.channel(`couple:${couple.id}:${Math.random().toString(36).slice(2)}`);
    const fanOut = (table) => (payload) => {
      const ev = { table, type: payload.eventType, new: payload.new, old: payload.old };
      listeners.current.forEach((fn) => { try { fn(ev); } catch (e) { console.error(e); } });
      if (table === "profiles" || table === "couples" || table === "categories") load();
      if (table === "pings" && payload.eventType === "INSERT" && payload.new?.from_user !== userId) {
        toast(`💛 ${partnerName.current} is thinking of you`);
      }
    };
    LIVE_TABLES.forEach((table) => {
      const filter = table === "couples" ? `id=eq.${couple.id}` : `couple_id=eq.${couple.id}`;
      ch.on("postgres_changes", { event: "INSERT", schema: "public", table, filter }, fanOut(table));
      ch.on("postgres_changes", { event: "UPDATE", schema: "public", table, filter }, fanOut(table));
      // DELETE payloads only carry the old row — a couple_id filter can't match them, so listen unfiltered
      // (RLS still scopes what this socket may see; tables have REPLICA IDENTITY FULL for that)
      ch.on("postgres_changes", { event: "DELETE", schema: "public", table }, fanOut(table));
    });
    let wasSubscribed = false;
    ch.subscribe((status, err) => {
      if (status === "SUBSCRIBED") {
        // (re)joined — anything could have happened while we were away: refetch everything
        if (wasSubscribed) { load(); listeners.current.forEach((fn) => { try { fn({ table: "*", type: "RESYNC" }); } catch {} }); }
        wasSubscribed = true;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") console.warn("realtime:", status, err?.message || "");
    });
    ch.on("system", {}, (m) => { if (m?.status === "error") console.warn("realtime system:", m.message); });
    // waking the tab after sleep also refetches (the socket may have dropped without telling us)
    const onWake = () => { if (document.visibilityState === "visible") { load(); listeners.current.forEach((fn) => { try { fn({ table: "*", type: "RESYNC" }); } catch {} }); } };
    document.addEventListener("visibilitychange", onWake);
    return () => { document.removeEventListener("visibilitychange", onWake); supabase.removeChannel(ch); };
  }, [couple?.id, userId, load]);

  // solo mode (or a profile row that hasn't landed yet): nothing to subscribe to — poll
  useEffect(() => {
    if (loading || me?.couple_id) return;
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [loading, me?.couple_id, load]);
  useEffect(() => {
    if (!me?.couple_id || partner) return;
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [me?.couple_id, partner, load]);

  const subscribe = useCallback((fn) => { listeners.current.add(fn); return () => listeners.current.delete(fn); }, []);

  function toast(msg) {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.map((x) => (x.id === id ? { ...x, bye: true } : x))), 2600);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3100);
  }

  // guards: name first, then a couple (waiting screen), then the app
  useEffect(() => {
    if (loading || !me) return;
    const onb = pathname.startsWith("/onboarding"), wait = pathname.startsWith("/waiting");
    if (!me.display_name && !onb) router.replace("/onboarding");
    else if (me.display_name && !me.couple_id && !onb && !wait) router.replace("/onboarding");
    else if (me.couple_id && partner && (wait || (onb && me.display_name))) router.replace("/today");
  }, [loading, me, partner, pathname]);

  const value = useMemo(() => ({
    supabase, me, partner, couple, categories, loading, reload: load, subscribe, toast, theme, flipTheme,
    tz: couple?.timezone || "Asia/Karachi",
    who: (uid) => (uid === userId ? "you" : "him"),
    nameOf: (uid) => (uid === userId ? me?.display_name || "you" : partner?.display_name || "your person"),
    letterOf: (uid) => initials(uid === userId ? me?.display_name : partner?.display_name),
    setConfetti: (fn) => { confettiRef.current = fn; },
    confetti: () => confettiRef.current?.(),
  }), [me, partner, couple, categories, loading, theme, userId]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {toasts.map((t) => <div key={t.id} className={"toast" + (t.bye ? " bye" : "")}>{t.msg}</div>)}
    </Ctx.Provider>
  );
}

/** Re-run `fetcher` on mount and whenever any of `tables` changes (Realtime). */
export function useLive(tables, fetcher, deps = []) {
  const { subscribe, couple } = useDuo();
  const [data, setData] = useState(null);
  const [tick, setTick] = useState(0);
  const timer = useRef(null);
  useEffect(() => {
    let alive = true;
    Promise.resolve(fetcher()).then((d) => { if (alive) setData(d); }).catch(console.error);
    return () => { alive = false; };
  }, [tick, couple?.id, ...deps]);
  useEffect(() => subscribe((ev) => {
    if (ev.table !== "*" && !tables.includes(ev.table)) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setTick((t) => t + 1), 120);
  }), [subscribe, tables.join(",")]);
  return [data, () => setTick((t) => t + 1)];
}
