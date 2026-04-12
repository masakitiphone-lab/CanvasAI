import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function getSupabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  return { url, publishableKey };
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const { url, publishableKey } = getSupabasePublicConfig();
  if (!url || !publishableKey) {
    return response;
  }

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({
          request,
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const claimsResult = await supabase.auth.getClaims();
  const claims = claimsResult.data?.claims ?? null;

  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === "/login";
  const isAuthRoute = pathname.startsWith("/auth");
  const isPublicApi = pathname.startsWith("/api/attachments/url");
  const isApi = pathname.startsWith("/api");

  response.headers.set("Cache-Control", "private, no-store, max-age=0");

  if (!claims && isApi && !isPublicApi) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (claims && isLoginPage) {
    const appUrl = request.nextUrl.clone();
    appUrl.pathname = "/";
    return NextResponse.redirect(appUrl);
  }

  if (isAuthRoute) {
    response.headers.set("Cache-Control", "no-store");
  }

  return response;
}
