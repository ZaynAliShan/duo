import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/format";

/** Auth redirect landing (kept for token links — e.g. a future password-recovery mail). */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  // Redirects are always built on the configured app URL. Only when it is unset (local Docker, where the
  // server sees itself as 0.0.0.0:3000) do we fall back to the host the browser actually used.
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "http";
  const origin = process.env.NEXT_PUBLIC_APP_URL || (host && /^[a-z0-9.-]+(:\d+)?$/i.test(host) ? `${proto}://${host}` : new URL(request.url).origin);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeNext(searchParams.get("next"));

  const supabase = await createClient();
  let error = null;
  if (code) ({ error } = await supabase.auth.exchangeCodeForSession(code));
  else if (token_hash && type) ({ error } = await supabase.auth.verifyOtp({ token_hash, type }));
  else error = new Error("missing code");

  if (error) { console.error("auth callback:", error.message); return NextResponse.redirect(`${origin}/login?error=link`); }
  return NextResponse.redirect(`${origin}${next}`);
}
