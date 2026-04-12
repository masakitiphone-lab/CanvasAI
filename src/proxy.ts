import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const { pathname } = request.nextUrl;

  // Bypass session check entirely for the auth callback.
  // Running getUser() here will prematurely consume or delete the PKCE code verifier cookie
  // before the actual callback API route can exchange it.
  if (pathname.startsWith("/auth/callback")) {
    return response;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // important: getUser() will refresh the session if needed
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Keep API routes protected, but don't hard-redirect page navigations here.
  // Route-level page protection was causing false unauthenticated redirects on client navigation.
  const isLoginPage = pathname === "/login";
  const isAuthRoute = pathname.startsWith("/auth");
  const isPublicApi = pathname.startsWith("/api/attachments/url"); // example of public if any
  const isApi = pathname.startsWith("/api");

  if (!user && isApi && !isPublicApi) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user && isLoginPage) {
    const appUrl = request.nextUrl.clone();
    appUrl.pathname = "/";
    return NextResponse.redirect(appUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
