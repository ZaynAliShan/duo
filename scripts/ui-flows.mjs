#!/usr/bin/env node
/** Interactive flows across two browsers (Zain mobile, Hamna desktop): check-in blur/reveal, QOTD reveal, hearts,
 *  ping toast (realtime), jar contribution, note + list, cycle log, calendar mark. */
// playwright isn't a project dep — use a local install, or point PLAYWRIGHT_DIR at one
const pwDir = process.env.PLAYWRIGHT_DIR;
const { chromium } = await import(pwDir ? `${pwDir}/node_modules/playwright/index.mjs` : "playwright")
  .catch(() => { console.error("playwright not found — `npm i -D playwright && npx playwright install chromium`, or set PLAYWRIGHT_DIR"); process.exit(2); });
import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
const BASE = process.argv[2] || "http://localhost:3000";
const OUT = new URL("../shots", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const env = Object.fromEntries(execSync("npx supabase status -o env", { encoding: "utf8" }).split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY || env.SECRET_KEY, { auth: { persistSession: false } });
// wipe today's check-ins/answers so the flow is repeatable
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
await admin.from("checkins").delete().eq("day", today); await admin.from("answers").delete().eq("day", today);
let fails = 0; const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) fails++; };
async function login(page, email) { const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email }); await page.goto(`${BASE}/auth/callback?token_hash=${data.properties.hashed_token}&type=magiclink&next=/today`); await page.waitForLoadState("networkidle"); await page.evaluate(() => localStorage.setItem("duo-nux-v2", JSON.stringify({ welcomed: true, firstEntry: true, seenTabs: { feed: 1, goals: 1, mems: 1, notes: 1, cycle: 1, cal: 1, us: 1 } }))); await page.reload(); await page.waitForLoadState("networkidle"); }
const browser = await chromium.launch();
const Z = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
const H = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errs = []; [Z, H].forEach((p) => p.on("pageerror", (e) => errs.push(e.message)));
await login(Z, "a@duo.test"); await login(H, "b@duo.test");

console.log("check-in: blur until you post");
ok(await Z.locator("#hFrame.blurred").count() === 1, "Zain sees Hamna's frame blurred");
await H.click("#zFrame"); await H.waitForTimeout(500); await H.click(".sheet.show .mood-btn >> nth=1"); await H.fill(".sheet.show input.note-input", "got the promotion news!! 🎉"); await H.click(".sheet.show .save-btn"); await H.waitForTimeout(1200);
ok((await H.textContent("body")).includes("got the promotion"), "Hamna's check-in posted");
await Z.waitForTimeout(1500);
ok(await Z.locator("#hFrame.blurred").count() === 1 && !(await Z.textContent("body")).includes("got the promotion"), "Zain still can't see it before posting");
await Z.click("#zFrame"); await Z.waitForTimeout(500); await Z.click(".sheet.show .mood-btn >> nth=0"); await Z.click(".sheet.show .save-btn"); await Z.waitForTimeout(1500);
ok(await Z.locator("#hFrame.blurred").count() === 0 && (await Z.textContent("body")).includes("got the promotion"), "after posting, Hamna's check-in is revealed live");
await Z.screenshot({ path: `${OUT}/flow_checkin_revealed.png` });

console.log("question of the day: reveal after both");
await Z.fill(".qotd input", "the biryani"); await Z.click(".q-send"); await Z.waitForTimeout(1000);
ok((await Z.textContent(".qotd")).includes("waiting on Hamna"), "Zain waits for Hamna");
await H.waitForTimeout(800); ok(!(await H.textContent(".qotd")).includes("the biryani"), "Hamna can't see Zain's answer yet");
await H.fill(".qotd input", "your laugh"); await H.click(".q-send"); await H.waitForTimeout(1200);
ok((await H.textContent(".qotd")).includes("the biryani") && (await Z.textContent(".qotd")).includes("your laugh"), "both answers revealed on both phones");

console.log("hearts + ping");
await Z.goto(BASE + "/feed"); await Z.waitForLoadState("networkidle"); await Z.waitForTimeout(800);
// state-independent: whatever the current state, one tap must flip it and the count must follow
const post = Z.locator(".igpost >> nth=0");
const wasLoved = (await post.locator(".heart").textContent()).includes("💛");
const likesBefore = await post.locator(".ig-likes").textContent();
await post.locator(".heart").click(); await Z.waitForTimeout(1200);
const isLoved = (await post.locator(".heart").textContent()).includes("💛");
const likesAfter = await post.locator(".ig-likes").textContent();
ok(isLoved === !wasLoved && likesAfter !== likesBefore, `heart toggled + count moved ("${likesBefore}" → "${likesAfter}")`);
await Z.goto(BASE + "/today"); await Z.waitForLoadState("networkidle"); await Z.click(".ci-ping"); await H.waitForTimeout(1500);
ok((await H.textContent("body")).includes("thinking of you"), "Hamna gets the ping toast live");

console.log("jar contribution");
await H.goto(BASE + "/goals"); await H.waitForLoadState("networkidle"); await H.click("#hubJarsCard"); await H.waitForTimeout(500);
await H.click(".contrib >> nth=0"); await H.waitForTimeout(500); await H.click(".sheet.show .chip >> nth=1"); await H.click(".sheet.show .save-btn"); await H.waitForTimeout(1200);
ok((await H.textContent("body")).includes("Hamna added Rs 2,500"), "contribution shows with name");

console.log("notes + list");
await Z.goto(BASE + "/notes"); await Z.waitForLoadState("networkidle"); await Z.click("text=stick a new note"); await Z.click(".pb-swatch >> nth=1"); await Z.waitForTimeout(900);
await Z.keyboard.type("chai date after payday?"); await Z.keyboard.press("Enter"); await Z.waitForTimeout(900);
ok((await Z.textContent("#notesBoard")).includes("chai date after payday"), "new note stuck + saved");
await H.goto(BASE + "/notes"); await H.waitForLoadState("networkidle"); await H.waitForTimeout(600);
ok((await H.textContent("#notesBoard")).includes("chai date after payday"), "Hamna sees Zain's note");
const doneBefore = await H.locator(".note.is-list .nlist li.done").count();
const untickedCb = H.locator(".note.is-list .nlist li:not(.done):not(.n-add) .cb");
const ticking = (await untickedCb.count()) > 0; // all done from earlier runs? untick one instead — either direction proves shared CRUD
await (ticking ? untickedCb.first() : H.locator(".note.is-list .nlist li.done .cb").first()).click(); await H.waitForTimeout(1200);
ok(await H.locator(".note.is-list .nlist li.done").count() === doneBefore + (ticking ? 1 : -1), `list item ${ticking ? "ticked" : "unticked"} by partner`);
await Z.screenshot({ path: `${OUT}/flow_notes_mobile.png`, fullPage: true });

console.log("live deletion (replica identity + unfiltered DELETE listeners)");
await Z.goto(BASE + "/feed"); await Z.waitForLoadState("networkidle"); await H.goto(BASE + "/feed"); await H.waitForLoadState("networkidle"); await Z.waitForTimeout(800);
const before = await H.locator(".igpost").count();
await Z.click(".ig-menu button >> nth=0"); await Z.waitForTimeout(500);
await Z.click(".sheet.show .g-del"); await Z.waitForTimeout(300); await Z.click(".sheet.show .g-del"); await Z.waitForTimeout(2500);
const after = await H.locator(".igpost").count();
ok(after === before - 1, `Hamna's feed loses the deleted post live (${before} → ${after})`);

console.log("cycle log (Hamna) + calendar mark (Zain)");
await H.goto(BASE + "/cycle"); await H.waitForLoadState("networkidle"); await H.click(".cyc-log-btn"); await H.waitForTimeout(500); const unsel = H.locator(".sheet.show .chip:not(.sel-rose)"); const symTxt = (await unsel.count()) ? await unsel.last().textContent() : null; if (symTxt) { await unsel.last().click(); await H.waitForTimeout(200); } else { await H.fill(".sheet.show input.note-input", "still here 💛"); } await H.click(".sheet.show .save-btn"); await H.waitForTimeout(1200);
ok((await H.textContent(".cyc-today-log")).includes(symTxt ? symTxt.trim() : "still here"), "today's cycle log saved (" + (symTxt ? symTxt.trim() : "note") + ")");
await Z.goto(BASE + "/cal/fin"); await Z.waitForLoadState("networkidle"); await Z.click("text=mark this day"); await Z.fill(".mark-add input", "movie night"); await Z.click(".mark-add button"); await Z.waitForTimeout(1000);
ok((await Z.textContent(".day-panel")).includes("movie night"), "calendar mark added");
await Z.screenshot({ path: `${OUT}/flow_cal_mobile.png`, fullPage: true });
if (errs.length) { console.log("page errors:", errs.slice(0, 5)); fails += errs.length; }
await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nflows clean 💛"); process.exit(fails ? 1 : 0);
