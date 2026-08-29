#!/usr/bin/env node
/** Headless walk-through: sign in as the seeded users via token_hash, screenshot every page (mobile + desktop),
 *  and fail on console errors. Usage: node scripts/ui-check.mjs [baseUrl]  (needs `supabase start` + app running) */
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

async function login(page, email) {
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  await page.goto(`${BASE}/auth/callback?token_hash=${link.properties.hashed_token}&type=magiclink&next=/today`);
  await page.waitForLoadState("networkidle");
}
const PAGES = ["/today", "/feed", "/goals", "/mems", "/notes", "/cycle", "/cal", "/cal/fin", "/cal/cycle", "/us"];
const browser = await chromium.launch();
let problems = 0;
for (const [who, email, vp] of [["zain-mobile", "a@duo.test", { width: 390, height: 844, isMobile: true, hasTouch: true }], ["hamna-desktop", "b@duo.test", { width: 1280, height: 900 }]]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
  await login(page, email);
  console.log(`${who}: after login → ${page.url()}`);
  await page.screenshot({ path: `${OUT}/${who}_00_nux.png` });
  // dismiss the first-time tour (welcome card → coach note)
  if (await page.locator(".nux-welcome").count()) { await page.click(".nux-skip"); await page.waitForTimeout(800); }
  if (await page.locator(".nux-layer").count()) { await page.click(".nux-layer"); await page.waitForTimeout(400); }
  if (await page.locator(".sheet.show").count()) { await page.keyboard.press("Escape"); await page.waitForTimeout(300); }
  for (const p of PAGES) {
    await page.goto(BASE + p); await page.waitForLoadState("networkidle"); await page.waitForTimeout(900);
    if (await page.locator(".nux-layer").count()) { await page.click(".nux-layer"); await page.waitForTimeout(400); }
    await page.screenshot({ path: `${OUT}/${who}${p.replace(/\//g, "_")}.png`, fullPage: true });
    const body = (await page.textContent("body")) || "";
    if (/Application error|Unhandled Runtime|Something went wrong/i.test(body)) { console.log(`  ✗ ${p} shows an error page`); problems++; } else console.log(`  ✓ ${p}`);
  }
  // add sheet interaction (mobile): FAB → 500 → first chip → save → feed shows Rs 500
  if (vp.isMobile) {
    await page.goto(BASE + "/today"); await page.waitForLoadState("networkidle");
    await page.click("#fab"); await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${who}_addsheet.png` });
    for (const k of ["5", "0", "0"]) await page.click(`.pad button:has-text("${k}")`);
    await page.click(".chip-row .chip >> nth=0"); await page.fill("#sheet input.note-input, .sheet.show input.note-input", "ui-check chai");
    await page.click(".sheet.show .save-btn"); await page.waitForURL("**/feed"); await page.waitForTimeout(1200);
    const ok = (await page.textContent("body")).includes("ui-check chai");
    console.log(ok ? "  ✓ add sheet → feed shows the new entry" : "  ✗ new entry not in feed"); if (!ok) problems++;
    await page.screenshot({ path: `${OUT}/${who}_feed_after_add.png`, fullPage: true });
  }
  const real = errors.filter((e) => !/favicon|sw\.js|Failed to load resource.*404|hydrat/i.test(e));
  if (real.length) { console.log(`  console errors (${real.length}):`); real.slice(0, 8).forEach((e) => console.log("   -", e.slice(0, 200))); problems += real.length; }
  await ctx.close();
}
await browser.close();
console.log(problems ? `\n${problems} problem(s)` : "\nUI walk-through clean 💛");
process.exit(problems ? 1 : 0);
