"use client";

import { useEffect, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export function useBrowserAuthReady() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabaseBrowserClient();

    async function hydrate() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!cancelled && user) {
        setIsReady(true);
      }
    }

    void hydrate();

    const { data } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (!cancelled && session?.user) {
        setIsReady(true);
      }
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  return isReady;
}
