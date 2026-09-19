import { createClient } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase client utilities.
 *
 * Three flavors:
 *  1. `createAdminClient()` — server-only, uses the SERVICE-ROLE (secret) key.
 *     Bypasses RLS. Used for: admin user creation, generating recovery links,
 *     updating a user's password from a recovery token. NEVER import this from
 *     a client component.
 *
 *  2. `createRouteSupabaseClient(req, res?)` — for route handlers. Uses the
 *     publishable (anon) key. Reads cookies from the request; if a response is
 *     provided, session writes (e.g. signInWithPassword) propagate to it.
 *
 *  3. `createRSCSupabaseClient()` — for server components (RSC). Uses the
 *     publishable key. Read-only (RSC cannot set cookies mid-request — that's
 *     done in route handlers or middleware).
 *
 *  4. `createBrowserSupabaseClient()` — for client components. Uses the
 *     publishable key. Cookies live in the browser via @supabase/ssr.
 */

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const SUPABASE_URL = requireEnv("SUPABASE_URL");
export const SUPABASE_PUBLISHABLE_KEY = requireEnv("SUPABASE_PUBLISHABLE_KEY");
export const SUPABASE_SECRET_KEY = requireEnv("SUPABASE_SECRET_KEY");
export const SUPABASE_JWKS_URL = requireEnv("SUPABASE_JWKS_URL");

/* --------------------------- 1. Admin client --------------------------- */

let adminClient: ReturnType<typeof createClient> | null = null;

/** Server-only Supabase client using the service role (secret) key. */
export function createAdminClient() {
  if (adminClient) return adminClient;
  adminClient = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return adminClient;
}

/* ----------------------- 2. Route handler client ----------------------- */

/**
 * Create a Supabase client bound to a route handler request.
 * Pass a `res` (NextResponse) if you'll perform operations that write to the
 * session cookie (login, signup, refresh) — those writes will land on `res`.
 */
export function createRouteSupabaseClient(
  req: NextRequest,
  res?: NextResponse
) {
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        if (!res) return; // read-only mode
        cookiesToSet.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options);
        });
      },
    },
  });
}

/* -------------------------- 3. RSC client ----------------------------- */

/**
 * Create a Supabase client for use in server components (RSC).
 * Reads cookies via next/headers. Cannot write cookies (use a route handler
 * or middleware for writes).
 */
export async function createRSCSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // RSC cannot set cookies — handled by route handlers / middleware.
      },
    },
  });
}
