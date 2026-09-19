import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./supabase-server";

/**
 * Create a Supabase client for use in client components. Cookies live in the
 * browser via @supabase/ssr's cookie helpers.
 *
 * Note: We don't use this in the auth flow today (login/signup go through our
 * own API routes, which set httpOnly cookies). This is here for any future
 * client-side Supabase calls (realtime, storage, PostgREST with RLS).
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
}
