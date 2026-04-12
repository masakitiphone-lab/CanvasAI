"use client";

import { useState } from "react";
import { Globe, LoaderCircle } from "lucide-react";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export function LoginButton() {
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async () => {
    setIsPending(true);
    setErrorMessage(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const redirectTo = `${window.location.origin.replace(/\/$/, "")}/auth/callback`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            access_type: "offline",
            prompt: "select_account",
          },
        },
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Google login failed.");
      setIsPending(false);
    }
  };

  return (
    <div className="grid gap-3">
      <ShimmerButton
        type="button"
        onClick={() => void handleLogin()}
        disabled={isPending}
        className="login-google-button"
        background="linear-gradient(135deg, #111827 0%, #1f2937 100%)"
        shimmerColor="rgba(255,255,255,0.28)"
      >
        {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Globe className="size-4" />}
        <span>{isPending ? "Connecting to Google..." : "Continue with Google"}</span>
      </ShimmerButton>
      {errorMessage ? <p className="login-error">{errorMessage}</p> : null}
    </div>
  );
}
