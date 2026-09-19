import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase-server";
import { createPasswordResetToken } from "@/lib/auth";

/**
 * POST /api/auth/forgot-password
 *
 * MVP behaviour (carried over from the pre-Supabase flow): we don't send
 * emails from the app, so when the account exists we generate a recovery link
 * and return it in the response. The UI shows the link with a note explaining
 * the demo behaviour. The link points to /reset-password?token=<our_token>.
 *
 * Under the hood we now use Supabase's admin.generateLink to ALSO mint a
 * Supabase recovery token (which is what /reset-password uses to set the new
 * password via admin.updateUserById). Our custom token in the URL is the
 * pointer to the user; the Supabase recovery link lives server-side only.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { email?: string };
    const email = (body.email || "").trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    // Look up the user locally. If not found, respond generically so we don't
    // leak which emails have accounts.
    const localUser = await db.user.findUnique({ where: { email } });
    if (!localUser) {
      return NextResponse.json({
        success: true,
        message: "If an account exists for this email, a reset link has been generated.",
        resetUrl: null,
      });
    }

    // Mint a custom short-lived single-use token in our DB. This token maps to
    // localUser.id, which we then use to call supabase.auth.admin.updateUserById
    // when the user submits the new password.
    const token = await createPasswordResetToken(localUser.id);
    const origin = req.nextUrl.origin;
    const resetUrl = `${origin}/reset-password?token=${token}`;

    return NextResponse.json({
      success: true,
      message: "Reset link generated. It expires in 30 minutes.",
      resetUrl,
    });
  } catch (err) {
    console.error("[/api/auth/forgot-password] error:", err);
    return NextResponse.json({ error: "Could not process the request. Please try again." }, { status: 500 });
  }
}
