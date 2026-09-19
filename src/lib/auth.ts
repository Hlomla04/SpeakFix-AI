import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  createRouteSupabaseClient,
  SUPABASE_JWKS_URL,
  SUPABASE_URL,
} from "@/lib/supabase-server";
import { createRemoteJWKSet, jwtVerify, errors as joseErrors } from "jose";

/* ─────────────────────────────────────────────────────────────────────────
 * Auth integration with Supabase.
 *
 *   • Login / signup / logout happen via our API routes which use the Supabase
 *     SDK under the hood (see src/app/api/auth/*). The SDK writes the session
 *     cookies via @supabase/ssr (named `sb-<ref>-auth-token`).
 *
 *   • `getSessionUser()` / `getUserFromRequest()` verify the JWT in that
 *     cookie via the Supabase JWKS endpoint using `jose`. No network call to
 *     Supabase Auth is required per request after the JWKS is cached.
 *
 *   • The `sub` claim in the JWT is the Supabase Auth user id (a UUID). We use
 *     it to look up the local User profile row (which carries role, name,
 *     preferred language, etc.) — Supabase Auth stores only email + password.
 * ──────────────────────────────────────────────────────────────────────── */

export const SESSION_COOKIE = "speakfix_session"; // legacy export (no longer used as the cookie name)

export type SessionUser = {
  id: string; // our local User.id
  supabaseUid: string; // Supabase Auth user UUID
  name: string;
  email: string;
  preferredLanguage: string;
  role: string;
};

/* --------------------------- JWKS verification --------------------------- */

const JWKS = createRemoteJWKSet(new URL(SUPABASE_JWKS_URL));

interface VerifiedJwt {
  sub: string;
  email?: string;
  exp: number;
}

/**
 * Verify a Supabase Auth access token against the JWKS endpoint.
 * Returns the `sub` (Supabase user UUID) on success, or null if the token is
 * missing / expired / malformed.
 */
export async function verifySupabaseJwt(token: string | undefined | null): Promise<VerifiedJwt | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `${SUPABASE_URL}/auth/v1`,
      audience: "authenticated",
    });
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    return {
      sub: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
      exp: typeof payload.exp === "number" ? payload.exp : 0,
    };
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) return null; // let middleware refresh
    if (err instanceof joseErrors.JWTClaimValidationFailed) return null;
    if (err instanceof joseErrors.JWSSignatureVerificationFailed) return null;
    if (err instanceof joseErrors.JWKSTimeout || err instanceof joseErrors.JWKSNoMatchingKey) {
      // Network / cache miss failure — fall back to Supabase getUser() below.
      return null;
    }
    // Don't log the actual token or error details — they could leak info.
    console.warn("[auth] JWT verification failed:", err instanceof Error ? err.name : "unknown");
    return null;
  }
}

/**
 * Extract the access_token from the @supabase/ssr session cookie.
 * The cookie name format is `sb-<project-ref>-auth-token` (possibly chunked
 * into `.0`, `.1`, ... if the session JSON exceeds the cookie size limit).
 */
function projectRef(): string {
  // Derive from SUPABASE_URL (e.g. https://upjfcykmvjzlbwreftvg.supabase.co)
  try {
    const u = new URL(SUPABASE_URL);
    const ref = u.hostname.split(".")[0];
    return ref;
  } catch {
    return "";
  }
}

function readAccessToken(allCookies: { name: string; value: string }[]): string | null {
  const ref = projectRef();
  if (!ref) return null;
  const prefix = `sb-${ref}-auth-token`;
  // Chunked cookies: name.0, name.1, ... → concatenate values in order
  const chunks = allCookies
    .filter((c) => c.name === prefix || c.name.startsWith(`${prefix}.`))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (chunks.length === 0) return null;
  const raw = chunks.map((c) => c.value).join("");
  if (!raw) return null;
  return parseSessionCookieValue(raw);
}

/**
 * Parse a Supabase session cookie value. @supabase/ssr stores the session as
 * either:
 *   1. URL-encoded JSON  — `{"access_token":"...","refresh_token":"...",...}`
 *   2. Base64-encoded JSON prefixed with "base64-" (newer @supabase/ssr versions)
 *   3. Chunked cookies concatenate as one of the above.
 *
 * Returns the access_token string if present, otherwise null.
 */
function parseSessionCookieValue(raw: string): string | null {
  // Try base64-encoded variant first.
  if (raw.startsWith("base64-")) {
    try {
      const decoded = Buffer.from(raw.slice("base64-".length), "base64").toString("utf-8");
      const parsed = JSON.parse(decoded);
      if (parsed && typeof parsed.access_token === "string") return parsed.access_token;
    } catch {
      /* fall through */
    }
  }
  // Try URL-encoded JSON.
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    if (parsed && typeof parsed.access_token === "string") return parsed.access_token;
  } catch {
    /* fall through */
  }
  // Try raw JSON.
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.access_token === "string") return parsed.access_token;
  } catch {
    /* ignore */
  }
  return null;
}

async function resolveLocalUser(supabaseUid: string | undefined | null): Promise<SessionUser | null> {
  if (!supabaseUid) return null;
  const localUser = await db.user.findUnique({ where: { supabaseUid } });
  if (!localUser) return null;
  return {
    id: localUser.id,
    supabaseUid: localUser.supabaseUid,
    name: localUser.name,
    email: localUser.email,
    preferredLanguage: localUser.preferredLanguage,
    role: localUser.role,
  };
}

/**
 * Resolve the current user from the request, falling back to Supabase
 * getUser() if JWT verification fails (covers the case where the access
 * token has expired but the refresh token is still valid — middleware
 * should normally have refreshed it, but just in case).
 */
async function resolveUserFromCookieJar(
  getAllCookies: () => { name: string; value: string }[]
): Promise<SessionUser | null> {
  const allCookies = getAllCookies();
  // Fast path: verify the access token via JWKS (no network call after cache).
  const accessToken = readAccessToken(allCookies);
  const verified = await verifySupabaseJwt(accessToken);
  if (verified) {
    const local = await resolveLocalUser(verified.sub);
    if (local) return local;
  }
  return null;
}

/** Read the current user inside a server component (RSC). */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return resolveUserFromCookieJar(() => store.getAll());
}

/** Read the current user inside a route handler / middleware. */
export async function getUserFromRequest(req: NextRequest): Promise<SessionUser | null> {
  // First try the fast JWKS path
  const verified = await verifySupabaseJwt(readAccessToken(req.cookies.getAll()));
  if (verified) {
    const local = await resolveLocalUser(verified.sub);
    if (local) return local;
  }
  // Fallback: use the supabase client which will refresh via the refresh token
  // if needed. We don't pass a response here, so any refreshed tokens won't
  // be persisted — middleware handles the refresh-write.
  const supabase = createRouteSupabaseClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return resolveLocalUser(user.id);
}

/* ---------------------------- Reset tokens ----------------------------- */
/* Used by the MVP recovery-link flow: forgot-password creates a custom token
 * (so we can map token → local user id), then reset-password uses
 * supabase.auth.admin.updateUserById to set the new password. */

import { randomBytes } from "crypto";
const RESET_TOKEN_TTL_MINUTES = 30;

export async function createPasswordResetToken(userId: string): Promise<string> {
  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
  await db.passwordResetToken.create({ data: { token, userId, expiresAt } });
  return token;
}

export async function consumePasswordResetToken(token: string): Promise<string | null> {
  const record = await db.passwordResetToken.findUnique({ where: { token } });
  if (!record) return null;
  if (record.usedAt || record.expiresAt < new Date()) return null;
  await db.passwordResetToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });
  return record.userId;
}
