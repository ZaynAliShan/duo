import { fmt } from "./format";

/** Build the monthly recap payload. Pure; wording follows the no-fight rule (facts about us, never a person).
 *  monthKey 'YYYY-MM'. entries/contribs already filtered to that month; prev* to the month before;
 *  bestContribBefore = the highest monthly contribution total in earlier months. */
export function buildRecap({ monthKey, entries, prevEntries, contribs, prevContribs, categories, goals, bestContribBefore = 0 }) {
  const exp = entries.filter((e) => e.kind === "expense");
  const total = exp.reduce((s, e) => s + Number(e.amount || 0), 0);
  const catName = (id) => categories.find((c) => c.id === id)?.name || "Other";
  const catEmoji = (id) => categories.find((c) => c.id === id)?.emoji || "🌀";
  const byCat = {};
  exp.forEach((e) => { const k = e.category_id || "other"; byCat[k] = (byCat[k] || 0) + Number(e.amount || 0); });
  const topId = Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a])[0];
  const topCat = topId ? { name: catName(topId), emoji: catEmoji(topId), amount: byCat[topId] } : null;
  const biggest = exp.slice().sort((a, b) => Number(b.amount) - Number(a.amount))[0] || null;
  const contribTotal = contribs.reduce((s, c) => s + Number(c.amount || 0), 0);
  const prevContribTotal = prevContribs.reduce((s, c) => s + Number(c.amount || 0), 0);
  const byGoal = {};
  contribs.forEach((c) => { byGoal[c.goal_id] = (byGoal[c.goal_id] || 0) + Number(c.amount || 0); });
  const goalLines = Object.keys(byGoal).map((gid) => {
    const g = goals.find((x) => x.id === gid);
    return { name: g?.name || "a jar", emoji: g?.emoji || "🫙", amount: byGoal[gid] };
  }).sort((a, b) => b.amount - a.amount);
  const moments = entries.filter((e) => e.kind === "moment").length;

  // one genuine celebration — never a dig
  const prevByCat = {};
  prevEntries.filter((e) => e.kind === "expense").forEach((e) => { const k = e.category_id || "other"; prevByCat[k] = (prevByCat[k] || 0) + Number(e.amount || 0); });
  let cheer = null;
  if (contribTotal > 0 && contribTotal > bestContribBefore && contribTotal >= prevContribTotal) cheer = `${fmt(contribTotal)} into the jars — your best saving month yet 💛`;
  if (!cheer) {
    const drops = Object.keys(prevByCat).filter((k) => prevByCat[k] > 0 && (byCat[k] || 0) < prevByCat[k] * 0.9)
      .map((k) => ({ k, pct: Math.round((1 - (byCat[k] || 0) / prevByCat[k]) * 100) })).sort((a, b) => b.pct - a.pct);
    if (drops[0]) cheer = `${catName(drops[0].k)} down ${drops[0].pct}% — nice one, team 🎉`;
  }
  if (!cheer && contribTotal > 0) cheer = `${fmt(contribTotal)} closer to the dreams — every drop counts 🫙`;
  if (!cheer && moments > 0) cheer = `${moments} ${moments === 1 ? "moment" : "moments"} kept this month — that's the good stuff ✨`;
  if (!cheer) cheer = "a whole month logged together — that's the habit 💛";

  return { monthKey, total, topCat, biggest: biggest ? { amount: Number(biggest.amount), note: biggest.note, category: catName(biggest.category_id) } : null,
    contribTotal, goalLines, moments, cheer, entries: exp.length };
}
