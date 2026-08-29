/** Feed + hearts, newest first. Ask for `limit + 1` rows so the caller knows whether there is more. */
export async function fetchFeed(supabase, coupleId, { limit = 200, since } = {}) {
  let q = supabase.from("entries").select("*").eq("couple_id", coupleId).order("happened_at", { ascending: false }).limit(limit + 1);
  if (since) q = q.gte("happened_at", since);
  const { data, error } = await q;
  if (error) throw error;
  const hasMore = (data || []).length > limit;
  const entries = (data || []).slice(0, limit);
  const ids = entries.map((e) => e.id);
  let hearts = [];
  if (ids.length) {
    // in chunks: a 500-id IN() list is fine for Postgres but not for a URL
    for (let i = 0; i < ids.length; i += 150) {
      const { data: h, error: he } = await supabase.from("hearts").select("entry_id,user_id").in("entry_id", ids.slice(i, i + 150));
      if (he) throw he;
      hearts = hearts.concat(h || []);
    }
  }
  const heartsBy = {};
  hearts.forEach((h) => { (heartsBy[h.entry_id] = heartsBy[h.entry_id] || []).push(h); });
  return { entries, heartsBy, hasMore };
}
