"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useDuo } from "@/components/DuoProvider";
import { copy } from "@/lib/copy";
import { signOutClean } from "@/lib/session";

export default function Waiting() {
  const { supabase, me, partner, couple, toast } = useDuo();
  const router = useRouter();
  const [code, setCode] = useState(null);
  const [qr, setQr] = useState(null);
  const [busy, setBusy] = useState(false);
  const base = typeof window !== "undefined" ? (process.env.NEXT_PUBLIC_APP_URL || window.location.origin) : "";
  const link = code ? `${base}/join/${code}` : "";

  useEffect(() => {
    if (!couple?.id) return;
    (async () => {
      const { data } = await supabase.from("invites").select("code, expires_at").eq("couple_id", couple.id).is("used_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1);
      if (data?.[0]) setCode(data[0].code);
      else { const { data: c } = await supabase.rpc("create_invite"); if (c) setCode(c); }
    })();
  }, [couple?.id]);
  useEffect(() => { if (link) QRCode.toDataURL(link, { width: 180, margin: 1, color: { dark: "#4A3527", light: "#FFFFFF" } }).then(setQr); }, [link]);
  useEffect(() => { if (partner) router.replace("/today"); }, [partner]);

  async function share() {
    const text = `${me?.display_name || "I"} invited you to Duo 💛 — a little world for two. ${link}`;
    if (navigator.share) { try { await navigator.share({ title: "Duo 💛", text, url: link }); } catch {} }
    else copyLink();
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(link); toast("link copied 💛"); } catch { toast(link); }
  }
  async function fresh() {
    setBusy(true);
    const { data, error } = await supabase.rpc("create_invite");
    setBusy(false);
    if (data) { setCode(data); toast("fresh code — the old one stopped working 💛"); } else if (error) toast(error.message);
  }
  async function signOut() { await signOutClean(supabase); router.replace("/login"); router.refresh(); }

  return (
    <div className="center-page">
      <div className="paper">
        <div className="we">💛</div>
        <h1>{copy.waitingTitle}</h1>
        <p>Send this to them on WhatsApp. When they tap it and sign in, you're linked — confetti on both phones. You can start logging while you wait.</p>
        <div className="big-code">{code || "······"}</div>
        <div className="tiny" style={{ marginTop: 0 }}>the code lasts 48 hours · one use · "new code" cancels the old one</div>
        {qr && <img className="qr" src={qr} alt="QR code for the invite link" width={180} height={180} />}
        <div className="row" style={{ marginTop: 14 }}>
          <button className="save-btn" onClick={share} disabled={!code}>Share the invite 💌</button>
        </div>
        <button className="ghost-btn" onClick={copyLink} disabled={!code}>copy invite link</button>
        <button className="ghost-btn" onClick={() => router.push("/today")}>start logging meanwhile →</button>
        <div className="tiny">
          <button className="link-btn" onClick={fresh} disabled={busy}>new code</button> ·
          <button className="link-btn" onClick={signOut}>sign out</button>
        </div>
      </div>
    </div>
  );
}
