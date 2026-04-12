"use client";

import { useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function AuthCompletePage() {
  useEffect(() => {
    let cancelled = false;

    async function finalizeSignIn() {
      const supabase = getSupabaseBrowserClient();
      const startedAt = Date.now();

      while (!cancelled && Date.now() - startedAt < 5000) {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.user) {
          window.location.replace("/");
          return;
        }

        await new Promise((resolve) => window.setTimeout(resolve, 200));
      }

      if (!cancelled) {
        window.location.replace("/login?authError=session_not_ready");
      }
    }

    void finalizeSignIn();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6">
      <div className="rounded-2xl border border-neutral-200 bg-white px-6 py-5 text-sm text-neutral-600 shadow-sm">
        Finalizing sign-in...
      </div>
    </main>
  );
}
