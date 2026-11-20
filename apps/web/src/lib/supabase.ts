"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Public values (safe in the browser bundle): Supabase Dashboard -> Project Settings -> API Keys.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/** False when the env vars are missing: the UI then explains that sign-in is not set up. */
export const AUTH_CONFIGURED = SUPABASE_URL !== "" && SUPABASE_KEY !== "";

let client: SupabaseClient | null = null;

/** Browser Supabase client, used for auth only; null on the server or when not configured. */
export function getSupabase(): SupabaseClient | null {
  if (!AUTH_CONFIGURED || typeof window === "undefined") return null;
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      flowType: "pkce",
      // The session (with its refresh token) is kept in localStorage and refreshed in the
      // background, so the user stays signed in across visits until they sign out.
      persistSession: true,
      autoRefreshToken: true,
      // app/auth/callback finishes Google / email-link sign-ins explicitly.
      detectSessionInUrl: false,
    },
  });
  return client;
}
