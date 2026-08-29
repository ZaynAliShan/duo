#!/usr/bin/env node
/** Local demo data: two linked users (a@duo.test / b@duo.test) with a month of entries, jars, notes, a cycle.
 *  Sign in via Mailpit (http://127.0.0.1:54324) — any code works for these emails after `supabase start`. */
import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";

const env = Object.fromEntries(execSync("npx supabase status -o env", { encoding: "utf8" }).split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const URL = env.API_URL, ANON = env.ANON_KEY || env.PUBLISHABLE_KEY, SERVICE = env.SERVICE_ROLE_KEY || env.SECRET_KEY;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
async function user(email, name, color) {
  let { data: u, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) { const { data } = await admin.auth.admin.listUsers(); u = { user: data.users.find((x) => x.email === email) }; }
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: e2 } = await c.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (e2) throw e2;
  await c.from("profiles").update({ display_name: name, avatar_color: color }).eq("id", u.user.id);
  return { c, id: u.user.id };
}
const A = await user("a@duo.test", "Zain", "#E8846B"), B = await user("b@duo.test", "Hamna", "#7FA477");
const { data: prof } = await A.c.from("profiles").select("couple_id").eq("id", A.id).single();
let cid = prof.couple_id;
if (!cid) {
  const { data, error } = await A.c.rpc("create_couple"); if (error) throw error;
  cid = data.couple_id;
  const { error: e } = await B.c.rpc("redeem_invite", { p_code: data.code }); if (e) throw e;
  await A.c.from("couples").update({ together_since: "2024-11-09", anniversary: "2024-11-09" }).eq("id", cid);
} else console.log("couple already exists — adding more data");
const { data: cats } = await A.c.from("categories").select("id,name").eq("couple_id", cid);
const cat = (n) => cats.find((c) => c.name === n).id;
const day = (n, h = 12) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(h, 0, 0, 0); return d.toISOString(); };
const rows = [
  [A, 850, "Food", "chai + samosas after work", 0, 18], [B, 4200, "Groceries", "the big Sunday run 🧺", 0, 15],
  [B, 600, "Transport", "rickshaw home", 1], [A, 2400, "Fun", "movie night tickets", 2], [B, 1250, "Food", "lunch with office people", 2],
  [A, 18000, "Bills", "internet + electricity", 4], [B, 3100, "Groceries", "", 5], [A, 950, "Gifts", "flowers, no reason 🌸", 7],
  [B, 780, "Food", "breakfast parathas", 8], [A, 3200, "Bills", "phone bills, both of us", 10], [B, 1600, "Fun", "arcade night 🕹", 13],
  [A, 3800, "Groceries", "week's veggies", 14], [B, 2600, "Food", "date-night dinner", 15], [A, 21000, "Bills", "internet + electricity", 34],
  [B, 18000, "Food", "all the June dinners", 38], [A, 15000, "Groceries", "restock everything", 40], [B, 7500, "Gifts", "ammi's birthday 🎂", 44],
];
for (const [u, amount, c, note, d, h] of rows) await u.c.from("entries").insert({ couple_id: cid, user_id: u.id, kind: "expense", amount, category_id: cat(c), note, happened_at: day(d, h) });
for (const [u, e, tag, note, d] of [[A, "🍚", "cooked together", "biryani night 🍚", 1], [B, "🚶", "long walk", "long walk, no phones", 6], [A, "💛", "just us", "date night, just because 💛", 15]])
  await u.c.from("entries").insert({ couple_id: cid, user_id: u.id, kind: "moment", moment_emoji: e, moment_tag: tag, note, happened_at: day(d) });
const { data: g1 } = await A.c.from("goals").insert({ couple_id: cid, name: "Hunza trip", emoji: "🏔", color: "#ABD3DE", target_amount: 300000, target_date: "2026-12-20" }).select().single();
const { data: g2 } = await B.c.from("goals").insert({ couple_id: cid, name: "New sofa", emoji: "🛋", color: "#FFB59E", target_amount: 120000, sort: 1 }).select().single();
for (const [u, g, amt, d, note] of [[B, g1, 4000, 0, "before breakfast ☀️"], [A, g1, 6000, 1], [B, g1, 5000, 4], [A, g1, 7000, 11], [B, g1, 10000, 18], [A, g1, 20000, 45, "bonus month 🎉"], [B, g2, 10000, 2], [A, g2, 8000, 9], [B, g2, 12000, 16], [A, g2, 15000, 40]])
  await u.c.from("goal_contributions").insert({ goal_id: g.id, couple_id: cid, user_id: u.id, amount: amt, note: note || "", created_at: day(d) });
for (const [u, t, e, done] of [[A, "see the northern lights", "🌌", false], [B, "learn to make sushi together", "🍣", true], [B, "road-trip with no itinerary", "🚗", false]])
  await u.c.from("bucket_items").insert({ couple_id: cid, title: t, emoji: e, added_by: u.id, done_at: done ? new Date().toISOString() : null });
for (const [u, body, c, x, y] of [[A, "max Rs 15k on eating out this month 🤞", "n-butter", .04, .04], [B, "movie night friday? 🍿 loser pays", "n-peach", .09, .4], [A, "you looked really cute today. that's it, that's the note", "n-sage", .52, .45]])
  await u.c.from("notes").insert({ couple_id: cid, user_id: u.id, body, color: c, pos_x: x, pos_y: y, tilt: Math.random() * 6 - 3 });
const { data: list } = await B.c.from("notes").insert({ couple_id: cid, user_id: B.id, kind: "list", title: "groceries this week 🧺", color: "n-sky", pos_x: .74, pos_y: .06, tilt: 2 }).select().single();
for (const [t, d] of [["atta", true], ["eggs 🥚", false], ["dish soap", false], ["chai patti", false]]) await B.c.from("list_items").insert({ note_id: list.id, couple_id: cid, text: t, done: d, added_by: B.id });
await A.c.from("calendar_marks").insert([{ couple_id: cid, day: day(-6).slice(0, 10), label: "Hunza planning night", emoji: "🏔", kind: "trip" }, { couple_id: cid, day: "2026-09-05", label: "internet bill", emoji: "💡", kind: "bill", recurs: "monthly" }]);
for (const s of [56, 27]) await B.c.from("cycles").upsert({ couple_id: cid, user_id: B.id, period_start: day(s).slice(0, 10), period_end: day(s - 4).slice(0, 10) }, { onConflict: "user_id,period_start" });
await B.c.from("profiles").update({ cycle_shared: true }).eq("id", B.id);
console.log("seeded 💛  sign in as a@duo.test (Zain) or b@duo.test (Hamna) — codes land in Mailpit http://127.0.0.1:54324");
