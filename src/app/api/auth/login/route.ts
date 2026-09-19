import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/supabase-server";
import { createServerClient } from "@supabase/ssr";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { email?: string; password?: string };
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";

    if (!email || !password) {
      return NextResponse.json(
        { error: "Please enter your email and password." },
        { status: 400 }
      );
    }

    // Track cookies the Supabase client wants to set during signInWithPassword.
    // We'll forward them onto the final JSON response below.
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

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      // Supabase returns a generic "Invalid login credentials" message —
      // preserve that property (no email-existence leak).
      return NextResponse.json(
        { error: "Incorrect email or password. Please try again." },
        { status: 401 }
      );
    }

    // Look up the local profile row (carries role / preferredLanguage / etc.)
    const localUser = await db.user.findUnique({ where: { supabaseUid: data.user.id } });
    if (!localUser) {
      // User exists in Supabase Auth but no local profile. Sign them out and
      // ask them to contact an admin.
      await supabase.auth.signOut();
      return NextResponse.json(
        { error: "Your account is missing a profile. Please contact an administrator." },
        { status: 403 }
      );
    }

    const res = NextResponse.json({
      user: {
        id: localUser.id,
        name: localUser.name,
        email: localUser.email,
        preferredLanguage: localUser.preferredLanguage,
      },
    });

    // Replay the cookie writes onto the actual response we're returning.
    for (const c of pendingCookies) {
      res.cookies.set(c.name, c.value, c.options as never);
    }
    return res;
  } catch (err) {
    console.error("[/api/auth/login] error:", err);
    return NextResponse.json({ error: "Could not log you in. Please try again." }, { status: 500 });
  }
}
