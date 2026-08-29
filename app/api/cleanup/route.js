import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/** Daily: delete storage prefixes for couples that no longer exist, and expired unused invites. */
export async function GET(request) {
  const auth = request.headers.get("authorization");
  // fail closed: no secret configured means nobody gets in
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ ok: false }, { status: 401 });
  const supabase = createServiceClient();
  // page through ALL couples — a partial or failed list must never look like "no couples", or we'd delete everything
  const live = new Set();
  for (let fromIdx = 0; ; fromIdx += 1000) {
    const { data: page, error } = await supabase.from("couples").select("id").range(fromIdx, fromIdx + 999);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    (page || []).forEach((c) => live.add(c.id));
    if (!page || page.length < 1000) break;
  }
  let removed = 0;
  for (const bucket of ["checkins", "moments"]) {
    const { data: folders } = await supabase.storage.from(bucket).list("", { limit: 1000 });
    for (const f of folders || []) {
      if (live.has(f.name)) continue;
      const { data: users } = await supabase.storage.from(bucket).list(f.name, { limit: 1000 });
      for (const u of users || []) {
        const { data: files } = await supabase.storage.from(bucket).list(`${f.name}/${u.name}`, { limit: 1000 });
        const paths = (files || []).map((x) => `${f.name}/${u.name}/${x.name}`);
        if (paths.length) { await supabase.storage.from(bucket).remove(paths); removed += paths.length; }
      }
    }
  }
  const { count } = await supabase.from("invites").delete({ count: "exact" }).is("used_at", null).lt("expires_at", new Date(Date.now() - 30 * 86400000).toISOString());
  return NextResponse.json({ ok: true, removedObjects: removed, expiredInvitesDeleted: count || 0 });
}
