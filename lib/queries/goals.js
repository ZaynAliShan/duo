export async function fetchGoals(supabase, coupleId) {
  const [{ data: goals }, { data: contribs }, { data: bucket }] = await Promise.all([
    supabase.from("goals").select("*").eq("couple_id", coupleId).order("sort").order("created_at"),
    supabase.from("goal_contributions").select("*").eq("couple_id", coupleId).order("created_at", { ascending: false }),
    supabase.from("bucket_items").select("*").eq("couple_id", coupleId).order("sort").order("created_at"),
  ]);
  const savedBy = {};
  (contribs || []).forEach((c) => { savedBy[c.goal_id] = (savedBy[c.goal_id] || 0) + Number(c.amount); });
  const jars = (goals || []).map((g) => {
    const saved = savedBy[g.id] || 0, target = Number(g.target_amount);
    return { ...g, saved, target, pct: target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0, hist: (contribs || []).filter((c) => c.goal_id === g.id) };
  });
  return { jars, contribs: contribs || [], bucket: bucket || [] };
}
