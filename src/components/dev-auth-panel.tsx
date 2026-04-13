"use client";

import { useEffect, useState } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type ServerSessionPayload = {
  ok: boolean;
  user: { id: string; email: string | null } | null;
};

type AuthFetchDebugEventDetail = {
  url: string;
  hasAccessToken: boolean;
  status: number | null;
  at: string;
};

export function DevAuthPanel() {
  const [browserUser, setBrowserUser] = useState<User | null>(null);
  const [serverUser, setServerUser] = useState<ServerSessionPayload["user"] | null>(null);
  const [events, setEvents] = useState<AuthFetchDebugEventDetail[]>([]);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabaseBrowserClient();

    async function hydrate() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const response = await fetch("/api/auth/session", { cache: "no-store" });
      const payload = (await response.json()) as ServerSessionPayload;

      if (!cancelled) {
        setBrowserUser(user);
        setServerUser(payload.user);
      }
    }

    void hydrate();

    const { data } = supabase.auth.onAuthStateChange(async (_event: AuthChangeEvent, session: Session | null) => {
      if (cancelled) return;
      setBrowserUser(session?.user ?? null);
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      const payload = (await response.json()) as ServerSessionPayload;
      if (!cancelled) {
        setServerUser(payload.user);
      }
    });

    const handleDebugEvent = (event: Event) => {
      const customEvent = event as CustomEvent<AuthFetchDebugEventDetail>;
      setEvents((current) => [customEvent.detail, ...current].slice(0, 12));
    };

    window.addEventListener("auth-fetch:debug", handleDebugEvent as EventListener);

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
      window.removeEventListener("auth-fetch:debug", handleDebugEvent as EventListener);
    };
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-[70] w-[420px] max-w-[calc(100vw-2rem)] rounded-2xl border border-neutral-800 bg-neutral-950/95 p-4 text-xs text-white shadow-2xl">
      <div className="mb-3 flex items-center justify-between">
        <strong className="text-sm">Dev Auth</strong>
        <span className="rounded-full bg-white/10 px-2 py-0.5">dev=1</span>
      </div>
      <div className="space-y-2">
        <div className="rounded-xl bg-white/5 p-3">
          <div>Browser user: {browserUser ? browserUser.email ?? browserUser.id : "null"}</div>
          <div>Server user: {serverUser ? serverUser.email ?? serverUser.id : "null"}</div>
        </div>
        <div className="rounded-xl bg-white/5 p-3">
          <div className="mb-2 font-medium">Recent authFetch</div>
          <div className="space-y-1">
            {events.length === 0 ? <div className="text-white/60">No requests yet</div> : null}
            {events.map((event, index) => (
              <div key={`${event.at}-${index}`} className="rounded-lg bg-black/20 px-2 py-1">
                <div>{event.url}</div>
                <div className="text-white/70">
                  token={event.hasAccessToken ? "yes" : "no"} status={event.status ?? "pending"} at={event.at}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
