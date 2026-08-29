import { format, formatDistanceToNowStrict, isToday, isYesterday, differenceInCalendarDays } from "date-fns";

export const fmt = (n) => "Rs " + Math.round(Number(n) || 0).toLocaleString("en-PK");
// 950 · 3.2k · 154k · 1.2M — never more than four characters before the unit, so it fits a phone-width calendar cell
export const fmtShort = (n) => {
  if (n >= 999500) return Math.round(n / 1e5) / 10 + "M";
  if (n >= 99950) return Math.round(n / 1000) + "k";
  if (n >= 1000) return Math.round(n / 100) / 10 + "k";
  return "" + Math.round(n);
};
export const esc = (s) => String(s ?? "");
export const initials = (name) => (name || "?").trim().charAt(0).toUpperCase() || "?";

/** YYYY-MM-DD for `date` as seen in the couple's timezone. */
export function dayKey(date, tz) {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
export const todayKey = (tz) => dayKey(new Date(), tz);

/** UTC instant of 12:00 wall-clock in `tz` on calendar day `key` — so a backdated entry
 *  lands on that day for BOTH partners no matter where the device is. */
export function coupleNoonISO(key, tz) {
  const [y, m, d] = key.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 12);
  const wall = new Date(new Date(guess).toLocaleString("en-US", { timeZone: tz || "Asia/Karachi" }));
  const offset = wall.getTime() - guess;
  return new Date(guess - offset).toISOString();
}

/** Parse "YYYY-MM-DD" into a local-midnight Date (calendar math only). */
export function fromKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export const keyOf = (d) => format(d, "yyyy-MM-dd");

/** "just now" · "2h ago" · "yesterday" · "Fri" · "Jul 13" — like the prototype's feed. */
export function relTime(ts) {
  const d = new Date(ts);
  const mins = (Date.now() - d.getTime()) / 60000;
  if (mins < 1) return "just now";
  if (mins < 60) return Math.round(mins) + "m ago";
  if (isToday(d)) return Math.round(mins / 60) + "h ago";
  if (isYesterday(d)) return "yesterday";
  const days = differenceInCalendarDays(new Date(), d);
  if (days < 7) return format(d, "EEE");
  return format(d, "MMM d");
}
export const niceDate = (d) => format(d instanceof Date ? d : fromKey(d), "MMM d, yyyy");
export const niceDay = (d) => format(d instanceof Date ? d : fromKey(d), "MMM d");
export function ago(ts) {
  try { return formatDistanceToNowStrict(new Date(ts), { addSuffix: true }); } catch { return ""; }
}
/** Greeting by the COUPLE's clock (same tz that decides "today"), not the device's. */
export function greeting(tz) {
  let h = new Date().getHours();
  try { h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz || "Asia/Karachi", hour: "numeric", hour12: false }).format(new Date())) % 24; } catch {}
  return h < 12 ? "Good morning, you two ☀️" : h < 17 ? "Good afternoon, you two 🌤" : "Good evening, you two 💛";
}
/** 1st · 2nd · 3rd · 4th · 11th · 21st … */
export function ordinal(n) {
  const v = n % 100;
  return n + (v >= 11 && v <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
}
/** A whole-number Rs amount from free text; null when it isn't one ("12.5", "1e5", "" → null). */
export function parseAmount(s) {
  const t = String(s ?? "").trim();
  if (!/^\d{1,9}$/.test(t)) return null;
  const n = Number(t);
  return n > 0 ? n : null;
}
/** Only same-origin paths may be used as a post-login destination — never `//host`, `http:`, `javascript:`… */
export function safeNext(p, fallback = "/today") {
  if (typeof p !== "string" || !/^\/(?![\/\\])/.test(p)) return fallback;
  if (/^\/(login|auth\/)/.test(p)) return fallback;
  return p;
}
/** Days since the epoch for a YYYY-MM-DD key — a rotation index that never repeats until the pool wraps. */
export function dayNumber(key) {
  const [y, m, d] = key.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}
/** Deterministic pick for a day — both phones land on the same item. */
export function hashDay(key) {
  let h = 2166136261;
  for (const ch of key) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return Math.abs(h >>> 0);
}
