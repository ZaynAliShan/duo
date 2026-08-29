import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request) {
  return updateSession(request);
}

export const config = {
  // route-group names aren't in URLs — list the real paths
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|sw\\.js|swe-worker.*|manifest\\.json|.*\\.(?:js|css|map|png|jpg|jpeg|svg|webp|ico|woff2?)$).*)"],
};
