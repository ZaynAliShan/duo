"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { copy } from "@/lib/copy";

export default function LoginPage() {
  return <Suspense fallback={null}><LoginInner /></Suspense>;
}

function LoginInner() {
  const supabase = createClient();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState("email"); // email → code
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setStandalone(window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true);
    try { const e = localStorage.getItem("duo-login-email"); if (e) setEmail(e); } catch {}
  }, []);

  async function sendLink(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true); setErr(""); setMsg("");
    const next = params.get("next") || "/today";
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setBusy(false);
    if (error) { setErr(copy.emailFail); return; }
    try { localStorage.setItem("duo-login-email", email.trim()); } catch {}
    setMsg(copy.emailSent);
    setStage("code");
  }

  async function verify(e) {
    e.preventDefault();
    if (code.trim().length < 6) return;
    setBusy(true); setErr("");
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) { setErr("that code didn't match — check the email and try again 💛"); return; }
    router.replace(params.get("next") || "/today");
    router.refresh();
  }

  return (
    <div className="center-page">
      <div className="paper">
        <div className="we">💛</div>
        <h1>duo <span>💛</span></h1>
        {stage === "email" ? (
          <>
            <p>Sign in with just your email. We'll send a link and a 6-digit code — no password, ever.</p>
            <form onSubmit={sendLink}>
              <input className="note-input" type="email" inputMode="email" autoComplete="email" placeholder="you@somewhere.com"
                value={email} onChange={(e) => setEmail(e.target.value)} required />
              {err && <div className="kind-msg">{err}</div>}
              <button className="save-btn" disabled={busy || !email.trim()}>{busy ? "sending…" : "Send my code 💌"}</button>
            </form>
          </>
        ) : (
          <>
            <p>{msg}{standalone ? " Type the code here — inside the installed app, the code is the way in." : " Tap the link, or type the code here."}</p>
            <form onSubmit={verify}>
              <input className="note-input code-input" inputMode="numeric" autoComplete="one-time-code" placeholder="••••••" maxLength={6}
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
              {err && <div className="kind-msg">{err}</div>}
              <button className="save-btn" disabled={busy || code.length < 6}>{busy ? "checking…" : "Sign in 💛"}</button>
            </form>
            <button className="ghost-btn" onClick={() => { setStage("email"); setCode(""); setMsg(""); }}>use a different email</button>
          </>
        )}
        <div className="tiny">Local dev: emails land in Mailpit at <a href="http://localhost:54324" target="_blank" rel="noreferrer">localhost:54324</a></div>
      </div>
    </div>
  );
}
