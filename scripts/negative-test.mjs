#!/usr/bin/env node
/** Negative test (plan §3): a third account, via raw REST with its own JWT, must see zero rows in every
 *  table, zero storage objects, and be unable to redeem a used code or join a full couple.
 *  Usage: node scripts/negative-test.mjs   (needs local Supabase running; uses service role to create users) */
import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";

const env = Object.fromEntries(execSync("npx supabase status -o env", { encoding: "utf8" }).split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const URL = env.API_URL, ANON = env.ANON_KEY || env.PUBLISHABLE_KEY, SERVICE = env.SERVICE_ROLE_KEY || env.SECRET_KEY;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

async function userClient(email) {
  const { data: u, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error && !/already/i.test(error.message)) throw error;
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: e2 } = await c.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (e2) throw e2;
  return c;
}
const TABLES = ["couples", "profiles", "invites", "categories", "entries", "hearts", "pings", "checkins", "answers", "goals", "goal_contributions", "bucket_items", "notes", "list_items", "facts", "calendar_marks", "cycles", "cycle_logs", "recaps"];
let fails = 0;
const check = (ok, msg) => { console.log((ok ? "  ✓ " : "  ✗ ") + msg); if (!ok) fails++; };

const stamp = Date.now();
const A = await userClient(`a${stamp}@duo.test`), B = await userClient(`b${stamp}@duo.test`), C = await userClient(`c${stamp}@duo.test`);
for (const [c, n] of [[A, "A"], [B, "B"], [C, "C"]]) await c.from("profiles").update({ display_name: n }).eq("id", (await c.auth.getUser()).data.user.id);

console.log("A starts a Duo, B joins");
const { data: created, error: ce } = await A.rpc("create_couple"); if (ce) throw ce;
const code = created.code;
const { error: be } = await B.rpc("redeem_invite", { p_code: code }); check(!be, "B redeems the code" + (be ? " — " + be.message : ""));
const { data: prof } = await A.from("profiles").select("*"); check(prof.length === 2, `A sees exactly 2 profiles (${prof.length})`);

console.log("A writes some data");
const aId = (await A.auth.getUser()).data.user.id, bId = (await B.auth.getUser()).data.user.id;
const cid = created.couple_id;
const { data: cats } = await A.from("categories").select("id").limit(1);
await A.from("entries").insert({ couple_id: cid, user_id: aId, kind: "expense", amount: 500, category_id: cats[0].id, note: "chai" });
await A.from("checkins").insert({ couple_id: cid, user_id: aId, day: "2026-08-28", mood: "😊" });
await A.from("notes").insert({ couple_id: cid, user_id: aId, body: "hi B" });
await A.from("cycles").insert({ couple_id: cid, user_id: aId, period_start: "2026-08-01" });
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const { error: upErr } = await A.storage.from("checkins").upload(`${cid}/${aId}/2026-08-28.jpg`, png, { contentType: "image/jpeg" }); check(!upErr, "A uploads a check-in photo" + (upErr ? " — " + upErr.message : ""));

console.log("C (third account) sees nothing");
for (const t of TABLES) { const { data, error } = await C.from(t).select("*"); const want = t === "profiles" ? 1 : 0; check(!error && data.length === want, `${t}: ${data?.length ?? "err"} rows${t === "profiles" ? " (only its own)" : ""}`); }
const { data: objs } = await C.storage.from("checkins").list(cid); check(!objs || objs.length === 0, "storage: 0 objects listed");
const { data: dl, error: dlErr } = await C.storage.from("checkins").download(`${cid}/${aId}/2026-08-28.jpg`); check(!!dlErr && !dl, "storage: cannot download A's photo");
const { error: r1 } = await C.rpc("redeem_invite", { p_code: code }); check(!!r1, "cannot redeem the used code: " + (r1?.message || "ALLOWED!"));
const { data: inv2 } = await A.rpc("create_invite"); check(!inv2, "A cannot mint a new invite for a full couple" + (inv2 ? " — got " + inv2 : ""));
const { error: w1 } = await C.from("entries").insert({ couple_id: cid, user_id: (await C.auth.getUser()).data.user.id, kind: "expense", amount: 1, category_id: cats[0].id }); check(!!w1, "cannot insert into A+B's couple");
const { error: g1 } = await C.from("profiles").update({ couple_id: cid }).eq("id", (await C.auth.getUser()).data.user.id); const { data: cp } = await C.from("profiles").select("couple_id").single(); check(!cp?.couple_id, "cannot set own couple_id directly");

console.log("B (the partner): blur + own-only rules");
const { data: bci } = await B.from("checkins").select("*"); check(bci.length === 0, "B can't see A's check-in before posting (" + bci.length + ")");
const { error: bdl } = await B.storage.from("checkins").download(`${cid}/${aId}/2026-08-28.jpg`); check(!!bdl, "B can't download A's check-in photo before posting");
await B.from("checkins").insert({ couple_id: cid, user_id: bId, day: "2026-08-28", mood: "🥰" });
const { data: bci2 } = await B.from("checkins").select("*"); check(bci2.length === 2, "after posting, B sees both check-ins (" + bci2.length + ")");
const { error: bdl2 } = await B.storage.from("checkins").download(`${cid}/${aId}/2026-08-28.jpg`); check(!bdl2, "after posting, B can download A's photo");
const { data: be1 } = await B.from("entries").update({ amount: 1 }).eq("user_id", aId).select(); check(!be1?.length, "B cannot edit A's entry");
const { data: bn } = await B.from("notes").update({ body: "hacked" }).eq("user_id", aId).select(); check(!bn?.length || bn[0].body === "hi B", "B cannot rewrite A's note text");
const { data: bp } = await B.from("notes").update({ pinned_top: true }).eq("user_id", aId).select(); check(bp?.length === 1 && bp[0].pinned_top, "B CAN pin A's note");
const { data: bcy } = await B.from("cycles").select("*"); check(bcy.length === 0, "B can't see A's cycle while sharing is off");
await A.from("profiles").update({ cycle_shared: true }).eq("id", aId);
const { data: bcy2 } = await B.from("cycles").select("*"); check(bcy2.length === 1, "B sees A's cycle once shared");

console.log("review-fix guarantees");
const { data: pv } = await C.rpc("invite_preview", { p_code: "ZZZZZZ" });
check(pv && pv.ok === false && !("reason" in pv), "invite preview is opaque to strangers");
const { error: sp } = await B.from("bucket_items").insert({ couple_id: cid, title: "forged", added_by: aId });
check(!!sp, "cannot forge the partner as author of a bucket item");
const { data: delCi } = await B.from("checkins").delete().eq("user_id", bId).select();
check(!delCi?.length, "a posted check-in cannot be deleted (peek-and-retract closed)");
const { data: gRow } = await A.from("goals").insert({ couple_id: cid, name: "t", target_amount: 100 }).select().single();
await A.from("goal_contributions").insert({ goal_id: gRow.id, couple_id: cid, user_id: aId, amount: 100 });
const { data: gDone } = await A.from("goals").select("completed_at").eq("id", gRow.id).single();
check(!!gDone.completed_at, "goal completion is set by the DB trigger");

console.log(fails ? `\n${fails} FAILED` : "\nall good — a third account sees nothing 💛");
// cleanup
for (const c of [A, B, C]) { const id = (await c.auth.getUser()).data.user.id; await admin.auth.admin.deleteUser(id); }
process.exit(fails ? 1 : 0);
