"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const CODE_RE = /^[A-Z2-9]{6,12}$/;

export default function JoinPage() {
  const { code: raw } = useParams();
  const code = String(raw || "").toUpperCase().trim();
  const router = useRouter();
  const supabase = createClient();
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    (async () => {
      if (!CODE_RE.test(code)) { setPreview({ ok: false }); return; }
      const { data } = await supabase.rpc("invite_preview", { p_code: code });
      setPreview(data || { ok: false });
      // only a code that actually works survives the login round-trip (cookie, redeemed on first authenticated load)
      if (data?.ok) {
        const secure = location.protocol === "https:" ? "; secure" : "";
        document.cookie = `duo_invite=${encodeURIComponent(code)}; path=/; max-age=${2 * 86400}; samesite=lax${secure}`;
      }
    })();
  }, [code]);

  const invalidMsg = "that invite doesn't work anymore — it may be used or expired (they last 48 hours). ask your person for a fresh link 💛 (already joined? just sign in.)";
  const who = preview?.inviter || "Your person";

  return (
    <div className="center-page">
      <div className="paper">
        <div className="we">💌</div>
        {!preview ? <p>opening your invite…</p> : preview.ok ? (
          <>
            <h1><span>{who}</span> invited you to Duo 💛</h1>
            <p>A little world for two. Sign in with your email, add your name and colour, and you're linked.</p>
            <button className="save-btn" onClick={() => router.push("/login?next=" + encodeURIComponent("/onboarding"))}>Join {preview.inviter ? preview.inviter : "them"} 💛</button>
          </>
        ) : (
          <>
            <h1>Hmm 🙈</h1>
            <p>{invalidMsg}</p>
            <button className="ghost-btn" onClick={() => router.push("/login")}>sign in anyway</button>
          </>
        )}
      </div>
    </div>
  );
}
