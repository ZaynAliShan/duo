import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/** Vercel Cron pings the DB daily so a free-tier project never pauses. */
export async function GET(request) {
  const auth = request.headers.get("authorization");
  // fail closed: no secret configured means nobody gets in
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ ok: false }, { status: 401 });
  const supabase = createServiceClient();
  const { count, error } = await supabase.from("questions").select("id", { count: "exact", head: true });
  return NextResponse.json({ ok: !error, questions: count, at: new Date().toISOString() });
}
