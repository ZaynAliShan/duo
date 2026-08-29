import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Server-side URL: inside Docker the container reaches Supabase via host.docker.internal. */
export function serverSupabaseUrl() {
  return process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
}

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(serverSupabaseUrl(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookieOptions: { name: "sb-duo-auth" },
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch { /* called from a Server Component — middleware refreshes the session instead */ }
      },
    },
  });
}

/** Service-role client for the cron routes only. Never import this from client code. */
export function createServiceClient() {
  return createServerClient(serverSupabaseUrl(), process.env.SUPABASE_SERVICE_ROLE_KEY, {
    cookies: { getAll() { return []; }, setAll() {} },
  });
}
