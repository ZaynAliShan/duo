#!/usr/bin/env node
/** Real sign-in path: email form → Mailpit → 6-digit code → onboarding → Start a Duo → waiting screen with code + QR;
 *  then a second brand-new user joins via /join/CODE → both linked. */
// playwright isn't a project dep — use a local install, or point PLAYWRIGHT_DIR at one
const pwDir = process.env.PLAYWRIGHT_DIR;
const { chromium } = await import(pwDir ? `${pwDir}/node_modules/playwright/index.mjs` : "playwright")
  .catch(() => { console.error("playwright not found — `npm i -D playwright && npx playwright install chromium`, or set PLAYWRIGHT_DIR"); process.exit(2); });
const BASE = process.argv[2] || "http://localhost:3000", MAIL = "http://127.0.0.1:54324";
const OUT = new URL("../shots", import.meta.url).pathname;
import { mkdirSync } from "node:fs";
mkdirSync(OUT, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) fails++; };
const stamp = Date.now();
async function codeFor(email) {
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${MAIL}/api/v1/search?query=to:${encodeURIComponent(email)}`).then((x) => x.json());
    if (r.messages?.length) { const m = await fetch(`${MAIL}/api/v1/message/${r.messages[0].ID}`).then((x) => x.json()); const code = (m.Text || m.HTML || "").match(/\b(\d{6})\b/)?.[1]; if (code) return code; }
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error("no email for " + email);
}
async function signIn(page, email) {
  await page.goto(BASE + "/login"); await page.fill("input[type=email]", email); await page.click(".save-btn"); await page.waitForTimeout(600);
  const code = await codeFor(email); await page.fill(".code-input", code); await page.click(".save-btn"); await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 }); await page.waitForLoadState("networkidle"); await page.waitForTimeout(800);
}
const browser = await chromium.launch();
const A = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
const B = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
[A, B].forEach((p) => p.on("pageerror", (e) => { console.log("PAGEERR", e.message); fails++; }));
console.log("A: email → code → onboarding");
await signIn(A, `nu-a-${stamp}@duo.test`);
ok(A.url().includes("/onboarding"), "new user lands on onboarding (" + new URL(A.url()).pathname + ")");
await A.screenshot({ path: `${OUT}/onb_1_profile.png` });
await A.fill(".paper input.note-input", "Ayla"); await A.click(".swatch >> nth=4"); await A.click(".paper .save-btn"); await A.waitForTimeout(1200);
ok((await A.textContent("body")).includes("Start a Duo"), "profile saved → start/join choice");
await A.click("text=Start a Duo"); await A.waitForURL("**/waiting", { timeout: 15000 }); await A.waitForTimeout(1500);
const code = (await A.textContent(".big-code")).trim();
ok(/^[A-Z2-9]{10}$/.test(code), "waiting screen shows a 10-character code: " + code);
ok(await A.locator("img.qr").count() === 1, "QR code rendered");
await A.screenshot({ path: `${OUT}/onb_2_waiting.png` });
await A.click("text=start logging meanwhile"); await A.waitForURL("**/today"); await A.waitForTimeout(800);
ok((await A.textContent("body")).includes("solo mode"), "solo mode works while waiting");

console.log("B: join link → sign in → auto-linked");
await B.goto(`${BASE}/join/${code}`); await B.waitForLoadState("networkidle"); await B.waitForTimeout(600);
ok((await B.textContent("body")).includes("Ayla") && (await B.textContent("body")).includes("invited you"), "join page names the inviter");
await B.screenshot({ path: `${OUT}/onb_3_join.png` });
await B.click(".paper .save-btn"); await B.waitForURL("**/login**");
await B.fill("input[type=email]", `nu-b-${stamp}@duo.test`); await B.click(".save-btn"); await B.waitForTimeout(600);
await B.fill(".code-input", await codeFor(`nu-b-${stamp}@duo.test`)); await B.click(".save-btn"); await B.waitForURL("**/onboarding**", { timeout: 15000 }); await B.waitForTimeout(800);
await B.fill(".paper input.note-input", "Bilal"); await B.click(".paper .save-btn"); await B.waitForURL("**/today", { timeout: 20000 }); await B.waitForTimeout(1500);
ok((await B.textContent("body")).includes("Ayla"), "B is linked — sees Ayla on Today");
await A.waitForTimeout(2500);
ok((await A.textContent("body")).includes("Bilal") || (await A.textContent(".toast").catch(() => "")).includes("linked"), "A sees Bilal arrive live");
await A.screenshot({ path: `${OUT}/onb_4_linked.png` });
console.log("C: a third person cannot use the spent code");
const C = await (await browser.newContext()).newPage();
await C.goto(`${BASE}/join/${code}`); await C.waitForLoadState("networkidle"); await C.waitForTimeout(600);
ok(/already used|complete/i.test(await C.textContent("body")), "spent code is refused kindly");
await browser.close(); console.log(fails ? `\n${fails} FAILED` : "\nonboarding clean 💛"); process.exit(fails ? 1 : 0);
