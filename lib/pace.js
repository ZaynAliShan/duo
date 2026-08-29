import { differenceInCalendarDays, format } from "date-fns";
import { fmt } from "./format";

/** The pace line — kind in every branch (ahead, behind, no date, date passed). */
export function paceLine({ saved, target, target_date }, now = new Date()) {
  saved = Number(saved) || 0; target = Number(target) || 0;
  if (target <= 0) return "every little bit fills this jar ✨";
  const left = target - saved;
  if (left <= 0) return "full — you two actually did it 🎉";
  const pct = saved / target;
  if (!target_date) {
    if (pct >= 0.85) return "So close — one good month finishes this one ✨";
    return saved > 0 ? "every little bit fills this jar ✨" : "the first drop is the special one 💛";
  }
  const due = typeof target_date === "string" ? new Date(target_date + "T12:00:00") : target_date;
  const days = differenceInCalendarDays(due, now);
  const when = format(due, "MMMM");
  if (days <= 0) return "the date slipped by — the jar's still here, no rush 💛";
  if (pct >= 0.85) return `So close — one good month finishes this one by ${when} ✨`;
  const weeks = Math.max(1, Math.ceil(days / 7));
  const perWeek = Math.ceil(left / weeks / 100) * 100;
  const expected = 1 - days / Math.max(days, differenceInCalendarDays(due, now) + 60); // soft, never scolds
  if (weeks <= 2) return `${fmt(left)} to go before ${when} — a little push finishes it 💪`;
  if (pct >= expected) return `${fmt(perWeek)}/week gets you there by ${when} — right on time 💪`;
  return `${fmt(perWeek)}/week from here lands it by ${when} — still very doable 💛`;
}
