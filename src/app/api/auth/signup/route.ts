import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase-server";

const LANGUAGES = [
  "English",
  "Afrikaans",
  "isiZulu",
  "isiXhosa",
  "Sesotho",
  "Setswana",
  "Sepedi",
  "Xitsonga",
  "siSwati",
  "Tshivenda",
  "isiNdebele",
  "French",
  "Portuguese",
  "Swahili",
];

/**
 * POST /api/auth/signup
 *
 * Fast signup flow:
 *   1. Validate input
 *   2. Check local DB for existing email (cheap)
 *   3. Create the Supabase Auth user via admin.createUser (auto-confirm email)
 *   4. Create the local User profile row
 *   5. Return success — the client redirects to /login so the user can sign
 *      in with their new credentials. We DO NOT auto-login because that would
 *      add a second network round-trip to Supabase Auth (slow).
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      name?: string;
      email?: string;
      password?: string;
      preferredLanguage?: string;
    };

    const name = (body.name || "").trim();
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";
    const preferredLanguage = LANGUAGES.includes(body.preferredLanguage || "")
      ? body.preferredLanguage!
      : "English";

    // --- validation ---
    if (name.length < 2 || name.length > 80) {
      return NextResponse.json(
        { error: "Please enter your full name (2 to 80 characters)." },
        { status: 400 }
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }
    if (password.length < 8 || password.length > 100) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    // Check local DB first (cheap).
    const existingLocal = await db.user.findUnique({ where: { email } });
    if (existingLocal) {
      return NextResponse.json(
        { error: "An account with this email already exists. Try logging in instead." },
        { status: 409 }
      );
    }

    // Create the user in Supabase Auth via the admin API (auto-confirm email
    // so the new user can log in immediately, no email round-trip).
    const admin = createAdminClient();
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, preferredLanguage },
    });

    if (createError) {
      if (createError.message.toLowerCase().includes("already registered")) {
        return NextResponse.json(
          { error: "An account with this email already exists. Try logging in instead." },
          { status: 409 }
        );
      }
      console.error("[/api/auth/signup] supabase createUser error:", createError.message);
      return NextResponse.json(
        { error: "Could not create your account. Please try again." },
        { status: 500 }
      );
    }
    // SDK returns the user nested under `data.user`, not at the top level.
    const createdUid = (created as { user?: { id?: string } } | null)?.user?.id;
    if (!createdUid) {
      return NextResponse.json(
        { error: "Could not create your account. Please try again." },
        { status: 500 }
      );
    }

    // Create the local User profile row, linked by supabaseUid.
    const localUser = await db.user.create({
      data: {
        supabaseUid: createdUid,
        name,
        email,
        preferredLanguage,
        role: "USER",
      },
    });

    // Return success — the client redirects to /login so the user can
    // sign in with the credentials they just created. Skipping the
    // auto-login saves a full Supabase Auth round-trip (~1-2 seconds).
    return NextResponse.json(
      {
        user: {
          id: localUser.id,
          name: localUser.name,
          email: localUser.email,
          preferredLanguage: localUser.preferredLanguage,
        },
        // Tell the client to redirect to /login instead of /app.
        next: "/login",
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[/api/auth/signup] error:", err);
    return NextResponse.json({ error: "Could not create your account. Please try again." }, { status: 500 });
  }
}
