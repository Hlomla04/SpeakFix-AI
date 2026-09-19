import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase-server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refresh the Supabase Auth session on every request before the route handler
 * runs. @supabase/ssr will automatically use the refresh token to obtain a
 * new access token if the existing one has expired, and the new session will
 * be written back to the response cookies.
 *
 * Also acts as the guard for protected routes:
 *   /app/**           → if no session, redirect to /login
 *   /login, /signup   → if session, redirect to /app
 */
export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: req });

  // Build a Supabase client that writes session updates to `res.cookies`.
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          req.cookies.set(name, value); // for downstream readers in this request
          res.cookies.set(name, value, options); // for the response
        });
      },
    },
  });

  // getUser() validates the access token against Supabase Auth (and refreshes
  // if needed via setAll above). This is the official Supabase recommendation
  // for Next.js SSR session refresh.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;
  const isProtected = path.startsWith("/app");
  const isAuthPage = path === "/login" || path === "/signup";

  if (isProtected && !user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", path);
    return NextResponse.redirect(url);
  }
  if (isAuthPage && user) {
    const url = req.nextUrl.clone();
    url.pathname = "/app";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: [
    // Skip Next internals + static assets, but run on all routes (API + pages)
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|ico|woff|woff2|ttf)$).*)",
  ],
};
