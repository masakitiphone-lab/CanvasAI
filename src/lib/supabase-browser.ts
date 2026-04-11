"use client";

import { createBrowserClient } from "@supabase/ssr";

let cachedBrowserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  if (cachedBrowserClient) {
    return cachedBrowserClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    throw new Error("Supabase public config is missing.");
  }

  cachedBrowserClient = createBrowserClient(url, anonKey);
  return cachedBrowserClient;
}
