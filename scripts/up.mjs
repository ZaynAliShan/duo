#!/usr/bin/env node
/** One command: start local Supabase (Docker, via the CLI), write .env.local from its keys, build + run the app in Docker. */
import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const sh = (cmd, opts = {}) => execSync(cmd, { stdio: "pipe", encoding: "utf8", ...opts });
console.log("💛 duo — starting local Supabase (first run pulls images, be patient)…");
let status;
try { status = sh("npx supabase status -o env"); }
catch { spawnSync("npx", ["supabase", "start"], { stdio: "inherit" }); status = sh("npx supabase status -o env"); }
const env = Object.fromEntries(status.split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const anon = env.ANON_KEY || env.PUBLISHABLE_KEY, service = env.SERVICE_ROLE_KEY || env.SECRET_KEY, api = env.API_URL || "http://127.0.0.1:54321";
if (!anon) { console.error("couldn't read Supabase keys — is Docker running?"); process.exit(1); }

const lines = [
  `NEXT_PUBLIC_SUPABASE_URL=${api}`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY=${anon}`,
  `NEXT_PUBLIC_APP_URL=http://localhost:3000`,
  `SUPABASE_INTERNAL_URL=`, // blank on the host; docker-compose.yml injects host.docker.internal for the container
  `SUPABASE_SERVICE_ROLE_KEY=${service}`,
  `CRON_SECRET=local-dev-secret`,
];
const current = existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "";
const merged = Object.fromEntries([...current.split("\n"), ...lines].filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));
// keep user overrides for anything not derived from Supabase
for (const l of lines) { const [k, v] = l.split(/=(.*)/s); if (["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"].includes(k) || !merged[k]) merged[k] = v; }
const envText = Object.entries(merged).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
writeFileSync(".env.local", envText); writeFileSync(".env", envText); // .env → plain `docker compose up --build` also works
console.log(`✓ Supabase up at ${api} · Studio http://127.0.0.1:54323 · emails at http://127.0.0.1:54324`);
console.log("🐳 building + starting the app in Docker…");
spawnSync("docker", ["compose", "up", "--build", ...process.argv.slice(2)], { stdio: "inherit" });
