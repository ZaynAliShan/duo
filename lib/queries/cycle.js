"use client";
import { useDuo } from "@/components/DuoProvider";

export async function fetchCycle(supabase, coupleId) {
  const [{ data: cycles }, { data: logs }] = await Promise.all([
    supabase.from("cycles").select("*").eq("couple_id", coupleId).order("period_start"),
    supabase.from("cycle_logs").select("*").eq("couple_id", coupleId).order("day"),
  ]);
  return { cycles: cycles || [], logs: logs || [] };
}

/** Whose cycle does the page show? Mine if I've logged any; else my partner's (visible only if she shares). */
export function useCycleOwner(d) {
  const { me, partner } = useDuo();
  if (!d) return null;
  const mineRows = d.cycles.filter((c) => c.user_id === me.id);
  if (mineRows.length) return { owner: me, rows: mineRows, logs: d.logs.filter((l) => l.user_id === me.id), isMe: true };
  const theirs = partner ? d.cycles.filter((c) => c.user_id === partner.id) : [];
  if (theirs.length) return { owner: partner, rows: theirs, logs: d.logs.filter((l) => l.user_id === partner.id), isMe: false };
  return { owner: me, rows: [], logs: [], isMe: true };
}
