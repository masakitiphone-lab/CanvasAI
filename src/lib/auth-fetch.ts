"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export async function authFetch(input: RequestInfo | URL, init?: RequestInit) {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init?.headers);
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  return fetch(input, {
    ...init,
    headers,
  });
}
