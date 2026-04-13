"use client";

import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

let pendingSessionPromise: Promise<string | null> | null = null;

async function resolveAccessToken() {
  const supabase = getSupabaseBrowserClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const {
      data: { session: refreshedSession },
    } = await supabase.auth.getSession();
    if (refreshedSession?.access_token) {
      return refreshedSession.access_token;
    }
  } else {
    const {
      data: { session: staleSession },
    } = await supabase.auth.getSession();

    if (staleSession) {
      await supabase.auth.signOut();
    }
  }

  return await new Promise<string | null>((resolve) => {
    const timeout = window.setTimeout(() => {
      subscription.data.subscription.unsubscribe();
      resolve(null);
    }, 3000);

    const subscription = supabase.auth.onAuthStateChange(async (_event: AuthChangeEvent, session: Session | null) => {
      if (session?.access_token) {
        window.clearTimeout(timeout);
        subscription.data.subscription.unsubscribe();
        resolve(session.access_token);
      }
    });
  });
}

async function getAccessToken() {
  if (!pendingSessionPromise) {
    pendingSessionPromise = resolveAccessToken().finally(() => {
      pendingSessionPromise = null;
    });
  }

  return pendingSessionPromise;
}

export async function authFetch(input: RequestInfo | URL, init?: RequestInit) {
  const accessToken = await getAccessToken();
  const headers = new Headers(init?.headers);
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(input, {
    ...init,
    headers,
  });

  if (typeof window !== "undefined") {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    window.dispatchEvent(
      new CustomEvent("auth-fetch:debug", {
        detail: {
          url,
          hasAccessToken: Boolean(accessToken),
          status: response.status,
          at: new Date().toISOString(),
        },
      }),
    );
  }

  return response;
}
