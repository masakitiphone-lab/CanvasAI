"use client";

import { useEffect } from "react";

export default function AuthCompletePage() {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.location.replace("/");
    }, 150);

    return () => {
      window.clearTimeout(timer);
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
