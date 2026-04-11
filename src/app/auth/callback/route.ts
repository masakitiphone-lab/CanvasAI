import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const upstreamError = requestUrl.searchParams.get("error");
  const upstreamErrorDescription = requestUrl.searchParams.get("error_description");
  const origin = requestUrl.origin;
  const redirectTo = new URL("/", origin);

  if (upstreamError) {
    const failedLoginUrl = new URL("/login", origin);
    failedLoginUrl.searchParams.set("authError", upstreamError);
    if (upstreamErrorDescription) {
      failedLoginUrl.searchParams.set("authErrorDescription", upstreamErrorDescription);
    }
    return NextResponse.redirect(failedLoginUrl);
  }

  if (!code) {
    redirectTo.pathname = "/login";
    redirectTo.searchParams.set("authError", "missing_code");
    return NextResponse.redirect(redirectTo);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    redirectTo.pathname = "/login";
    redirectTo.searchParams.set("authError", "missing_config");
    return NextResponse.redirect(redirectTo);
  }

  const response = NextResponse.redirect(redirectTo);
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

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const failedRedirect = NextResponse.redirect(new URL("/login?authError=callback_failed", origin));
    response.cookies.getAll().forEach((cookie) => {
      failedRedirect.cookies.set(cookie);
    });
    return failedRedirect;
  }

  return response;
}
