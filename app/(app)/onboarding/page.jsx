"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDuo } from "@/components/DuoProvider";
import { SWATCHES } from "@/lib/palette";
import { uploadPhoto, freshPath } from "@/lib/photos";
import { initials } from "@/lib/format";
import Photo from "@/components/Photo";
import { readCookie, clearInviteCookie } from "@/lib/invite-cookie";

const CODE_LEN = 10;

export default function Onboarding() {
  const { supabase, me, reload, loading, toast } = useDuo();
  const router = useRouter();
  const [name, setName] = useState("");
  const [color, setColor] = useState(SWATCHES[0].main);
  const [photoPath, setPhotoPath] = useState(null);
  const [step, setStep] = useState("profile"); // profile → choose → join
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef();

  useEffect(() => {
    if (!me) return;
    setName(me.display_name || ""); setColor(me.avatar_color || SWATCHES[0].main); setPhotoPath(me.avatar_url || null);
    const inv = readCookie("duo_invite");
    if (me.display_name) {
      // a named user arriving with an invite in hand goes straight to the join step (auto-redeems below)
      setStep(me.couple_id ? "done" : inv ? "join" : "choose");
    }
    if (inv && !me.couple_id) setCode(decodeURIComponent(inv));
  }, [me?.id]);

  useEffect(() => { if (me?.couple_id && step === "done") router.replace("/today"); }, [me?.couple_id, step]);

  async function saveProfile(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setErr("");
    const { error } = await supabase.from("profiles").update({ display_name: name.trim(), avatar_color: color, avatar_url: photoPath }).eq("id", me.id);
    setBusy(false);
    if (error) { setErr("couldn't save that — try again 💛"); return; }
    await reload();
    // decide from the freshest row, not the `me` this closure captured before the reload
    const { data: fresh } = await supabase.from("profiles").select("couple_id").eq("id", me.id).maybeSingle();
    const linked = !!fresh?.couple_id;
    const inv = readCookie("duo_invite");
    if (inv && !linked) { setCode(decodeURIComponent(inv)); setStep("join"); }
    else setStep(linked ? "done" : "choose");
  }
  async function pickPhoto(e) {
    const f = e.target.files?.[0]; if (!f) return;
    setBusy(true);
    try { setPhotoPath(await uploadPhoto(supabase, "avatars", freshPath(me.id, "avatar"), f)); }
    catch (err) { setErr(err?.message?.includes("format") ? err.message : "that photo didn't upload — try another? 💛"); }
    setBusy(false);
  }
  async function startDuo() {
    setBusy(true); setErr("");
    const { error } = await supabase.rpc("create_couple");
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await reload();
    router.replace("/waiting");
  }
  async function join(e) {
    e?.preventDefault();
    if (code.trim().length < 6) return;
    setBusy(true); setErr("");
    const { error } = await supabase.rpc("redeem_invite", { p_code: code.trim().toUpperCase() });
    setBusy(false);
    if (error) { setErr(error.message.replace(/^.*?: /, "")); clearInviteCookie(); return; }
    clearInviteCookie();
    toast("You're linked! 🎉");
    await reload();
    router.replace("/today");
  }
  useEffect(() => { if (step === "join" && code.length >= 6 && readCookie("duo_invite")) join(); }, [step]);

  if (loading || !me) return <div className="center-page"><div className="paper"><p>one sec…</p></div></div>;

  return (
    <div className="center-page">
      <div className="paper">
        {step === "profile" && (
          <form onSubmit={saveProfile}>
            <div className="ava-big" style={{ background: color }} onClick={() => fileRef.current?.click()} role="button" aria-label="Add a photo">
              {photoPath ? <Photo bucket="avatars" path={photoPath} alt="" /> : initials(name)}
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickPhoto} />
            <h1>Make your profile 🎨</h1>
            <p>Your name, your colour, a photo if you like. Your person will see these.</p>
            <input className="note-input" placeholder="what should Duo call you?" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <div className="swatch-row">
              {SWATCHES.map((s) => <button type="button" key={s.key} className={"swatch" + (color === s.main ? " sel" : "")} style={{ background: s.main }} onClick={() => setColor(s.main)} aria-label={s.key} />)}
            </div>
            <button type="button" className="ghost-btn" style={{ marginTop: 0, marginBottom: 12 }} onClick={() => fileRef.current?.click()}>{photoPath ? "🖼 change photo" : "📷 add a photo (optional)"}</button>
            {err && <div className="kind-msg">{err}</div>}
            <button className="save-btn" disabled={busy || !name.trim()}>{busy ? "saving…" : "That's me 💛"}</button>
          </form>
        )}
        {step === "choose" && (
          <>
            <div className="we">💛</div>
            <h1>Hi, {me.display_name} 👋</h1>
            <p>Duo is a world for two. Start one and invite your person — or join theirs.</p>
            {err && <div className="kind-msg">{err}</div>}
            <button className="save-btn" disabled={busy} onClick={startDuo}>{busy ? "one sec…" : "Start a Duo 💛"}</button>
            <button className="ghost-btn" onClick={() => setStep("join")}>I have an invite</button>
            <button className="link-btn" style={{ marginTop: 10 }} onClick={() => setStep("profile")}>edit my profile</button>
          </>
        )}
        {step === "join" && (
          <form onSubmit={join}>
            <div className="we">💌</div>
            <h1>Join your person</h1>
            <p>Paste the code from their link.</p>
            <input className="note-input code-input" placeholder="ABC123DEF4" maxLength={CODE_LEN} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""))} autoFocus />
            {err && <div className="kind-msg">{err}</div>}
            <button className="save-btn" disabled={busy || code.trim().length < 6}>{busy ? "linking…" : "Link us 💛"}</button>
            <button type="button" className="ghost-btn" onClick={() => { setStep("choose"); setErr(""); }}>back</button>
          </form>
        )}
        {step === "done" && <p>taking you in…</p>}
      </div>
    </div>
  );
}
