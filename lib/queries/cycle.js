"use client";
import { useDuo } from "@/components/DuoProvider";

export async function fetchCycle(supabase, coupleId) {
  const [{ data: cycles, error: e1 }, { data: logs, error: e2 }] = await Promise.all([
    supabase.from("cycles").select("*").eq("couple_id", coupleId).order("period_start"),
    supabase.from("cycle_logs").select("*").eq("couple_id", coupleId).order("day"),
  ]);
  if (e1) throw e1; if (e2) throw e2;
  return { cycles: cycles || [], logs: logs || [] };
}

/** Whose cycle does the page show? Mine if I've logged any; else my partner's (visible only if she shares).
 *  `nobody` is true when there is nothing to show for either — so headings can stay neutral instead of
 *  calling an empty page "my cycle" on the partner's phone. */
export function useCycleOwner(d) {
  const { me, partner } = useDuo();
  if (!d) return null;
  const mineRows = d.cycles.filter((c) => c.user_id === me.id);
  if (mineRows.length) return { owner: me, rows: mineRows, logs: d.logs.filter((l) => l.user_id === me.id), isMe: true, nobody: false };
  const theirs = partner ? d.cycles.filter((c) => c.user_id === partner.id) : [];
  if (theirs.length) return { owner: partner, rows: theirs, logs: d.logs.filter((l) => l.user_id === partner.id), isMe: false, nobody: false };
  return { owner: me, rows: [], logs: [], isMe: true, nobody: true };
}
