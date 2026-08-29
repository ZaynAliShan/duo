"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { differenceInCalendarDays, format } from "date-fns";
import { useDuo } from "./DuoProvider";
import AddSheet from "./AddSheet";
import Confetti from "./Confetti";
import Photo from "./Photo";
import NuxTour from "./NuxTour";
import { flush, queued } from "@/lib/offline-queue";
import { fromKey } from "@/lib/format";
import { signOutClean } from "@/lib/session";
import { readInvite, clearInviteCookie } from "@/lib/invite-cookie";

export const NAV = [
  { href: "/today", ico: "🏠", label: "Today", tab: "Today" },
  { href: "/feed", ico: "📸", label: "Our feed", tab: "Feed" },
  { href: "/goals", ico: "🎯", label: "Goals", tab: "Goals" },
  { href: "/mems", ico: "🎞", label: "Memories", tab: "Memories" },
  { href: "/notes", ico: "📌", label: "Corkboard", tab: "Corkboard" },
  { href: "/cycle", ico: "🌸", label: "Her cycle", tab: "Cycle" },
  { href: "/cal", ico: "📅", label: "Calendars", tab: "Calendars" },
  { href: "/us", ico: "💸", label: "Us", tab: "Us" },
];

export function Avatar({ profile, cls, size }) {
  const letter = (profile?.display_name || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <div className={"avatar " + cls} style={size ? { width: size, height: size } : undefined} title={profile?.display_name || ""}>
      {profile?.avatar_url ? <Photo bucket="avatars" path={profile.avatar_url} alt="" /> : letter}
    </div>
  );
}

export default function AppShell({ children }) {
  const { me, partner, couple, loading, loadError, reload, theme, flipTheme, supabase, toast } = useDuo();
  const pathname = usePathname();
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const [stuck, setStuck] = useState(false);
  const bare = pathname.startsWith("/onboarding") || pathname.startsWith("/waiting");

  // offline queue: replay when we're back
  useEffect(() => {
    const refresh = () => queued().then((q) => setPending(q.length));
    const go = async () => {
      const { sent, dropped } = await flush(supabase);
      if (sent) toast(`synced ${sent} ${sent === 1 ? "entry" : "entries"} 💛`);
      if (dropped) toast(`${dropped} ${dropped === 1 ? "entry" : "entries"} couldn't be saved and ${dropped === 1 ? "was" : "were"} let go 🥺`);
      refresh();
    };
    refresh(); if (navigator.onLine) go();
    addEventListener("online", go); addEventListener("duo-queue-change", refresh);
    return () => { removeEventListener("online", go); removeEventListener("duo-queue-change", refresh); };
  }, []);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  // an invite link opened by someone who is already in a Duo: say so once, then forget the code
  useEffect(() => {
    if (!me?.couple_id) return;
    if (readInvite()) { clearInviteCookie(); toast("you're already in a Duo — that invite was ignored 💛"); }
  }, [me?.couple_id]);

  // "opening Duo…" must not be forever: after 8 s show what's wrong and a way out
  useEffect(() => {
    if (!loading && me) { setStuck(false); return; }
    const t = setTimeout(() => setStuck(true), 8000);
    return () => clearTimeout(t);
  }, [loading, me]);

  if (bare) return <>{children}<Confetti /></>;
  if (loading || !me) {
    return (
      <div className="center-page"><div className="paper skeleton"><div className="we">💛</div>
        <p>opening Duo…</p>
        {stuck && (
          <div className="kind-msg" role="alert">
            {loadError ? `couldn't reach Duo — ${loadError}` : "your profile hasn't shown up yet — this can happen right after sign-up."}
            <div style={{ marginTop: 8 }}>
              <button className="link-btn" onClick={() => { setStuck(false); reload(); }}>try again</button> ·{" "}
              <button className="link-btn" onClick={async () => { await signOutClean(supabase); router.replace("/login"); router.refresh(); }}>sign out</button>
            </div>
          </div>
        )}
      </div></div>
    );
  }

  const since = couple?.together_since || couple?.anniversary;
  const days = since ? differenceInCalendarDays(new Date(), fromKey(since)) : null;
  const active = (href) => pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="app">
      <aside className="side">
        <div className="wordrow">
          <div className="wordmark">duo <span>💛</span></div>
          <button className="theme-mini" onClick={flipTheme} aria-label="switch between light and dark">{theme === "dark" ? "☀️" : "🌙"}</button>
        </div>
        <button className="add-side" id="addSide" onClick={() => setAddOpen(true)}>＋ Add an entry</button>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={"navitem" + (active(n.href) ? " active" : "")} data-pane={n.href.slice(1)}>
            <span className="ico">{n.ico}</span>{n.label}
          </Link>
        ))}
        <div className="side-foot">
          <div className="foot-row">
            <div className="avatars"><Avatar profile={me} cls="you" />{partner && <Avatar profile={partner} cls="him" />}</div>
            <div className="names">{me.display_name}{partner ? ` & ${partner.display_name}` : ""}</div>
          </div>
          {days != null && <div className="together"><b>{days.toLocaleString("en-PK")}</b> days together 💛</div>}
          <div className="anniv">{since ? `since ${format(fromKey(since), "MMM d, yyyy")}` : <Link href="/us#settings">set your together-since date →</Link>}</div>
        </div>
      </aside>

      <div className="content">
        <header className="mobilebar">
          <div className="wordmark">duo <span>💛</span></div>
          <div className="bar-right">
            <button className="theme-mini" onClick={flipTheme} aria-label="switch between light and dark">{theme === "dark" ? "☀️" : "🌙"}</button>
            <div className="avatars"><Avatar profile={me} cls="you" />{partner && <Avatar profile={partner} cls="him" />}</div>
          </div>
        </header>
        <main id="main">
          <section className="pane active">{children}</section>
        </main>
      </div>

      <button className="fab" id="fab" aria-label="Add an entry" onClick={() => setAddOpen(true)}>＋</button>
      <nav className="tabbar">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={"tab" + (active(n.href) ? " active" : "")} data-pane={n.href.slice(1)}>
            <span className="ico">{n.ico}</span><span className="tl">{n.tab}</span>
          </Link>
        ))}
      </nav>

      <AddSheet open={addOpen} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); if (pathname !== "/feed") router.push("/feed"); }} />
      {pending > 0 && <div className="sync-pill">syncing {pending} {pending === 1 ? "entry" : "entries"}…</div>}
      <Confetti />
      <NuxTour onAdd={() => setAddOpen(true)} />
    </div>
  );
}
