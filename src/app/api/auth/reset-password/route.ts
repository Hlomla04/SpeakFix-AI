import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase-server";
import { consumePasswordResetToken } from "@/lib/auth";

/**
 * POST /api/auth/reset-password
 *
 * Body: { token: string, password: string }
 *
 * The `token` is the custom short-lived single-use token we created in
 * /api/auth/forgot-password. We consume it to find the local user id, then
 * look up the linked Supabase Auth user id and call
 * `supabase.auth.admin.updateUserById` to set the new password in Supabase.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { token?: string; password?: string };
    const token = (body.token || "").trim();
    const password = body.password || "";

    if (!token) {
      return NextResponse.json({ error: "Reset token is missing." }, { status: 400 });
    }
    if (password.length < 8 || password.length > 100) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    // Consume the token — single-use, expired tokens are rejected.
    const localUserId = await consumePasswordResetToken(token);
    if (!localUserId) {
      return NextResponse.json(
        { error: "This reset link is invalid or has expired. Please request a new one." },
        { status: 400 }
      );
    }

    // Look up the local User row to get the linked Supabase Auth uid.
    const localUser = await db.user.findUnique({ where: { id: localUserId } });
    if (!localUser) {
      return NextResponse.json(
        { error: "This account no longer exists. Please sign up again." },
        { status: 400 }
      );
    }

    // Update the password in Supabase Auth via the admin API.
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(localUser.supabaseUid, {
      password,
    });
    if (error) {
      console.error("[/api/auth/reset-password] supabase updateUserById error:", error.message);
      return NextResponse.json(
        { error: "Could not reset your password. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Your password has been reset. You can now log in.",
    });
  } catch (err) {
    console.error("[/api/auth/reset-password] error:", err);
    return NextResponse.json({ error: "Could not reset your password. Please try again." }, { status: 500 });
  }
}
