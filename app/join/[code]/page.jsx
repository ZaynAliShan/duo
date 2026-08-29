"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function JoinPage() {
  const { code } = useParams();
  const router = useRouter();
  const supabase = createClient();
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("invite_preview", { p_code: code });
      setPreview(data || { ok: false, reason: "unknown" });
      // the code survives the login round-trip in a cookie, redeemed on first authenticated load
      document.cookie = `duo_invite=${encodeURIComponent(code)}; path=/; max-age=${7 * 86400}; samesite=lax`;
    })();
  }, [code]);

  const invalidMsg = "that invite doesn't work anymore — it may be used or expired. ask your person for a fresh link 💛 (already joined? just sign in.)";

  return (
    <div className="center-page">
      <div className="paper">
        <div className="we">💌</div>
        {!preview ? <p>opening your invite…</p> : preview.ok ? (
          <>
            <h1><span>{preview.inviter}</span> invited you to Duo 💛</h1>
            <p>A little world for two. Sign in with your email, add your name and colour, and you're linked.</p>
            <button className="save-btn" onClick={() => router.push("/login?next=" + encodeURIComponent("/onboarding"))}>Join {preview.inviter} 💛</button>
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
