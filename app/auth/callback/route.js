import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  // inside Docker the server's own URL is 0.0.0.0:3000 — build redirects from what the browser actually used
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "http";
  const origin = process.env.NEXT_PUBLIC_APP_URL || (host ? `${proto}://${host}` : new URL(request.url).origin);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  let next = searchParams.get("next") || "/today";
  if (!next.startsWith("/")) next = "/today";

  const supabase = await createClient();
  let error = null;
  if (code) ({ error } = await supabase.auth.exchangeCodeForSession(code));
  else if (token_hash && type) ({ error } = await supabase.auth.verifyOtp({ token_hash, type }));
  else error = new Error("missing code");

  if (error) { console.error("auth callback:", error.message); return NextResponse.redirect(`${origin}/login?error=link`); }
  return NextResponse.redirect(`${origin}${next}`);
}
