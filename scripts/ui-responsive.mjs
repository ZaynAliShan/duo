#!/usr/bin/env node
/** Responsive audit: every public + private page at many viewports (320px → 4K).
 *  Flags horizontal page overflow and elements spilling past the viewport edge. Screenshots to $OUT.
 *  Usage: node scripts/ui-responsive.mjs [baseUrl]  (needs `supabase start` + app running) */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:3000";
const OUT = process.env.OUT || new URL("../shots/responsive", import.meta.url).pathname;
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
mkdirSync(OUT, { recursive: true });
const env = Object.fromEntries(execSync("npx supabase status -o env", { encoding: "utf8" }).split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY || env.SECRET_KEY, { auth: { persistSession: false } });

async function login(page, email, next = "/today") {
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  await page.goto(`${BASE}/auth/callback?token_hash=${link.properties.hashed_token}&type=magiclink&next=${next}`);
  await page.waitForLoadState("networkidle");
}

const VIEWPORTS = [
  ["phone-320", 320, 568, true], ["phone-360", 360, 740, true], ["phone-390", 390, 844, true], ["phone-430", 430, 932, true],
  ["phone-land-844", 844, 390, true],
  ["tab-600", 600, 960, true], ["ipad-768", 768, 1024, true], ["ipad-820", 820, 1180, true], ["ipad-land-1024", 1024, 768, true], ["ipad-land-1180", 1180, 820, true],
  ["laptop-1280", 1280, 800], ["laptop-1366", 1366, 768], ["laptop-1440", 1440, 900], ["desk-1920", 1920, 1080], ["qhd-2560", 2560, 1440], ["4k-3840", 3840, 2160],
];
const PUBLIC = ["/", "/login", "/offline", "/join/NOPE"];
const PRIVATE = ["/today", "/feed", "/goals", "/mems", "/notes", "/cycle", "/cal", "/cal/fin", "/cal/cycle", "/us"];

const measure = () => {
  const de = document.documentElement, vw = de.clientWidth;
  const out = { scrollW: de.scrollWidth, vw, spill: [] };
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;
    if (cs.position === "fixed" && el.closest(".sheet,.nux-layer")) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > vw + 2 || r.left < -2) {
      // ignore things clipped by an overflow:hidden/clip/scroll ancestor
      let p = el.parentElement, clipped = false;
      while (p && p !== document.body) { const o = getComputedStyle(p); if (/hidden|clip|auto|scroll/.test(o.overflowX + o.overflow)) { clipped = true; break; } p = p.parentElement; }
      if (clipped) continue;
      out.spill.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".") : ""} [${Math.round(r.left)}→${Math.round(r.right)}]`);
    }
  }
  out.spill = [...new Set(out.spill)].slice(0, 6);
  return out;
};

// two throwaway users: one stuck on onboarding, one waiting for a partner (gives us a live invite code too)
const ts = Date.now();
const SOLO = `solo-${ts}@duo.test`, WAIT = `wait-${ts}@duo.test`;
for (const email of [SOLO, WAIT]) { const { error } = await admin.auth.admin.createUser({ email, password: "password123", email_confirm: true }); if (error) throw error; }
const browser = await chromium.launch();
let inviteCode = null;
{ const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage();
  await login(page, WAIT, "/onboarding"); await page.waitForTimeout(800);
  await page.fill(".paper input.note-input", "Waiter"); await page.click(".paper .save-btn"); await page.waitForTimeout(800);
  await page.click('.paper .save-btn:has-text("Start a Duo")'); await page.waitForURL("**/waiting"); await page.waitForTimeout(1200);
  inviteCode = (await page.textContent(".big-code") || "").trim(); console.log("invite code:", inviteCode); await ctx.close(); }
if (inviteCode && /^[A-Z0-9]{6}$/.test(inviteCode)) PUBLIC.push("/join/" + inviteCode);
let problems = 0;
async function check(page, label, path) {
  await page.goto(BASE + path); await page.waitForLoadState("networkidle"); await page.waitForTimeout(700);
  if (await page.locator(".nux-welcome").count()) { await page.click(".nux-skip"); await page.waitForTimeout(500); }
  if (await page.locator(".nux-layer").count()) { await page.click(".nux-layer").catch(() => {}); await page.waitForTimeout(300); }
  const m = await page.evaluate(measure);
  const bad = m.scrollW > m.vw + 1 || m.spill.length;
  if (bad) problems++;
  console.log(`${bad ? "✗" : "✓"} ${label.padEnd(16)} ${path.padEnd(11)} ${m.scrollW > m.vw + 1 ? `scrollW ${m.scrollW}>${m.vw} ` : ""}${m.spill.join(" | ")}`);
  await page.screenshot({ path: `${OUT}/${label}${path.replace(/\//g, "_")}.png`, fullPage: true });
}
for (const [label, width, height, mobile] of VIEWPORTS) {
  if (ONLY && !ONLY.some((o) => label.includes(o))) continue;
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: !!mobile, hasTouch: !!mobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  for (const p of PUBLIC) await check(page, label, p);
  await login(page, "a@duo.test");
  for (const p of PRIVATE) await check(page, label, p);
  // add sheet open
  await page.goto(BASE + "/today"); await page.waitForLoadState("networkidle"); await page.waitForTimeout(400);
  if (await page.locator(".nux-layer").count()) { await page.click(".nux-layer").catch(() => {}); await page.waitForTimeout(300); }
  await page.click(mobile && width < 900 ? "#fab" : "#addSide"); await page.waitForTimeout(500);
  const m = await page.evaluate(measure);
  if (m.scrollW > m.vw + 1 || m.spill.length) { problems++; console.log(`✗ ${label.padEnd(16)} addsheet    ${m.spill.join(" | ")}`); } else console.log(`✓ ${label.padEnd(16)} addsheet`);
  await page.screenshot({ path: `${OUT}/${label}_addsheet.png` });
  await ctx.close();
  // onboarding (fresh user) + waiting (couple with no partner)
  const ctx2 = await browser.newContext({ viewport: { width, height }, isMobile: !!mobile, hasTouch: !!mobile, deviceScaleFactor: 1 });
  const p2 = await ctx2.newPage();
  await login(p2, SOLO, "/onboarding"); await check(p2, label, "/onboarding");
  await ctx2.close();
  const ctx3 = await browser.newContext({ viewport: { width, height }, isMobile: !!mobile, hasTouch: !!mobile, deviceScaleFactor: 1 });
  const p3 = await ctx3.newPage();
  await login(p3, WAIT, "/waiting"); await check(p3, label, "/waiting");
  await ctx3.close();
}
await browser.close();
console.log(problems ? `\n${problems} problem(s)` : "\nresponsive audit clean 💛");
