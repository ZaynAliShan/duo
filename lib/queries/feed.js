/** Feed + hearts, newest first. */
export async function fetchFeed(supabase, coupleId, { limit = 200, since } = {}) {
  let q = supabase.from("entries").select("*").eq("couple_id", coupleId).order("happened_at", { ascending: false }).limit(limit);
  if (since) q = q.gte("happened_at", since);
  const { data: entries, error } = await q;
  if (error) throw error;
  const ids = (entries || []).map((e) => e.id);
  let hearts = [];
  if (ids.length) {
    const { data } = await supabase.from("hearts").select("entry_id,user_id").in("entry_id", ids);
    hearts = data || [];
  }
  const heartsBy = {};
  hearts.forEach((h) => { (heartsBy[h.entry_id] = heartsBy[h.entry_id] || []).push(h); });
  return { entries: entries || [], heartsBy };
}
