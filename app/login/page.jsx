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
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [offerCreate, setOfferCreate] = useState(false); // sign-in failed → offer to create the account

  useEffect(() => {
    try { const e = localStorage.getItem("duo-login-email"); if (e) setEmail(e); } catch {}
  }, []);

  const next = params.get("next") || "/today";
  const go = () => { try { localStorage.setItem("duo-login-email", email.trim()); } catch {} router.replace(next); router.refresh(); };

  async function signIn(e) {
    e.preventDefault();
    if (!email.trim() || pw.length < 6) return;
    setBusy(true); setErr(""); setOfferCreate(false);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
    setBusy(false);
    if (!error) return go();
    if (/invalid login credentials/i.test(error.message)) { setOfferCreate(true); setErr(copy.loginNoMatch); return; }
    setErr(copy.loginFail);
  }

  async function createAccount() {
    setBusy(true); setErr("");
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: pw });
    setBusy(false);
    if (error) { setErr(/already registered/i.test(error.message) ? copy.loginWrongPw : copy.loginFail); setOfferCreate(false); return; }
    // no session back = the email already exists (Supabase hides that) or confirmation is on server-side; either way the password is the fix
    if (!data.session) { setErr(copy.loginWrongPw); setOfferCreate(false); return; }
    go();
  }

  return (
    <div className="center-page">
      <div className="paper">
        <div className="we">💛</div>
        <h1>duo <span>💛</span></h1>
        <p>Your email and a password — that's the whole door. No verification emails, nothing to wait for.</p>
        <form onSubmit={signIn}>
          <input className="note-input" type="email" inputMode="email" autoComplete="email" placeholder="you@somewhere.com"
            value={email} onChange={(e) => { setEmail(e.target.value); setOfferCreate(false); }} required />
          <div className="pw-wrap">
            <input className="note-input" type={show ? "text" : "password"} autoComplete="current-password" placeholder="password (6+ characters)"
              minLength={6} value={pw} onChange={(e) => { setPw(e.target.value); setOfferCreate(false); }} required />
            <button type="button" className="pw-eye" onClick={() => setShow((v) => !v)} aria-label={show ? "hide password" : "show password"}>{show ? "🙈" : "👀"}</button>
          </div>
          {err && <div className="kind-msg">{err}</div>}
          {offerCreate ? (
            <button type="button" className="save-btn" disabled={busy} onClick={createAccount}>{busy ? "creating…" : "Yes, create my account 💛"}</button>
          ) : (
            <button className="save-btn" disabled={busy || !email.trim() || pw.length < 6}>{busy ? "checking…" : "Sign in 💛"}</button>
          )}
        </form>
        <div className="tiny">New here? Sign in with the email + password you want, and we'll create your account on the spot. Pick a password you'll remember — there's no reset email.</div>
      </div>
    </div>
  );
}
