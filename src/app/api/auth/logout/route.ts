import { NextRequest, NextResponse } from "next/server";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase-server";
import { createServerClient } from "@supabase/ssr";

/**
 * POST /api/auth/logout
 * Clears the Supabase Auth session cookie by signing out server-side. The
 * @supabase/ssr client will set the session cookies to empty values on the
 * response, which the browser then immediately expires.
 */
export async function POST(req: NextRequest) {
  try {
    const pendingCookies: { name: string; value: string; options: Record<string, unknown> }[] = [];
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const c of cookiesToSet) pendingCookies.push(c);
        },
      },
    });
    await supabase.auth.signOut();

    const res = NextResponse.json({ success: true });
    for (const c of pendingCookies) {
      res.cookies.set(c.name, c.value, c.options as never);
    }
    return res;
  } catch (err) {
    console.error("[/api/auth/logout] error:", err);
    return NextResponse.json({ success: true });
  }
}
