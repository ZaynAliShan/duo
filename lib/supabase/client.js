"use client";
import { createBrowserClient } from "@supabase/ssr";

/** one cookie name everywhere — server and browser may reach Supabase via different hosts (Docker) */
export const COOKIE = { name: "sb-duo-auth" };
let client;
export function createClient() {
  if (client) return client;
  client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookieOptions: COOKIE }
  );
  return client;
}
