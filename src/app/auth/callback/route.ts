import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { writeAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const upstreamError = requestUrl.searchParams.get("error");
  const upstreamErrorDescription = requestUrl.searchParams.get("error_description");
  const origin = requestUrl.origin;
  const redirectTo = new URL("/auth/complete", origin);

  if (upstreamError) {
    await writeAuditLog({
      action: "auth.callback.error",
      status: "error",
      metadata: { error: upstreamError, description: upstreamErrorDescription, step: "upstream" },
    });
    const failedLoginUrl = new URL("/login", origin);
    failedLoginUrl.searchParams.set("authError", upstreamError);
    if (upstreamErrorDescription) {
      failedLoginUrl.searchParams.set("authErrorDescription", upstreamErrorDescription);
    }
    const response = NextResponse.redirect(failedLoginUrl);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  if (!code) {
    await writeAuditLog({
      action: "auth.callback.error",
      status: "error",
      metadata: { step: "missing_code" },
    });
    redirectTo.pathname = "/login";
    redirectTo.searchParams.set("authError", "missing_code");
    const response = NextResponse.redirect(redirectTo);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    await writeAuditLog({
      action: "auth.callback.error",
      status: "error",
      metadata: { step: "missing_config" },
    });
    redirectTo.pathname = "/login";
    redirectTo.searchParams.set("authError", "missing_config");
    const response = NextResponse.redirect(redirectTo);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  const response = NextResponse.redirect(redirectTo);
  response.headers.set("Cache-Control", "no-store");
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    await writeAuditLog({
      action: "auth.callback.error",
      status: "error",
      metadata: { error: error.message, code: error.code, step: "exchange" },
    });
    const failedRedirect = NextResponse.redirect(new URL("/login?authError=callback_failed", origin));
    response.cookies.getAll().forEach((cookie) => {
      failedRedirect.cookies.set(cookie);
    });
    return failedRedirect;
  }

  if (data.user) {
    await writeAuditLog({
      action: "auth.callback.success",
      userId: data.user.id,
      status: "ok",
      metadata: { email: data.user.email },
    });
  }

  return response;
}
