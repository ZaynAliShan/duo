import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { safeNext } from "@/lib/format";

const PUBLIC = [/^\/$/, /^\/login/, /^\/auth\//, /^\/join\//, /^\/api\//, /^\/manifest\.json$/, /^\/icons\//, /^\/sw\.js$/, /^\/swe-worker/, /^\/offline$/];
const isPublic = (p) => PUBLIC.some((re) => re.test(p));

export async function updateSession(request) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookieOptions: { name: "sb-duo-auth" },
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // refreshes the session cookie if needed — do not remove
  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  if (!user && !isPublic(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", safeNext(path));
    return NextResponse.redirect(url);
  }
  if (user && path.startsWith("/login")) {
    // already signed in: honour a safe `next` (the join flow sends /onboarding), never an external one
    const url = request.nextUrl.clone();
    url.pathname = safeNext(request.nextUrl.searchParams.get("next"));
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}
