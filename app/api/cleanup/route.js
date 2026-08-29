import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/** Daily: delete storage prefixes for couples / users that no longer exist, and expired unused invites. */
export async function GET(request) {
  const auth = request.headers.get("authorization");
  // fail closed: no secret configured means nobody gets in
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ ok: false }, { status: 401 });
  const supabase = createServiceClient();

  // page through ALL rows — a partial or failed list must never look like "nothing exists", or we'd delete everything
  async function allIds(table) {
    const ids = new Set();
    for (let fromIdx = 0; ; fromIdx += 1000) {
      const { data: page, error } = await supabase.from(table).select("id").range(fromIdx, fromIdx + 999);
      if (error) throw new Error(`${table}: ${error.message}`);
      (page || []).forEach((r) => ids.add(r.id));
      if (!page || page.length < 1000) break;
    }
    return ids;
  }
  // storage listing is paged too — `limit: 1000` on its own silently skips the rest
  async function listAll(bucket, prefix) {
    const out = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000, offset });
      if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return out;
  }
  async function removeTree(bucket, prefix) {
    let n = 0;
    const kids = await listAll(bucket, prefix);
    const files = kids.filter((k) => k.id).map((k) => `${prefix}/${k.name}`);
    for (let i = 0; i < files.length; i += 100) { await supabase.storage.from(bucket).remove(files.slice(i, i + 100)); n += Math.min(100, files.length - i); }
    for (const folder of kids.filter((k) => !k.id)) n += await removeTree(bucket, `${prefix}/${folder.name}`);
    return n;
  }

  try {
    const [couples, users] = await Promise.all([allIds("couples"), allIds("profiles")]);
    let removed = 0;
    for (const bucket of ["checkins", "moments"]) {
      for (const f of await listAll(bucket, "")) if (!couples.has(f.name)) removed += await removeTree(bucket, f.name);
    }
    // avatars live under <user_id>/ — sweep the folders of deleted accounts
    for (const f of await listAll("avatars", "")) if (!users.has(f.name)) removed += await removeTree("avatars", f.name);

    const { count } = await supabase.from("invites").delete({ count: "exact" }).is("used_at", null).lt("expires_at", new Date(Date.now() - 30 * 86400000).toISOString());
    return NextResponse.json({ ok: true, removedObjects: removed, expiredInvitesDeleted: count || 0 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
