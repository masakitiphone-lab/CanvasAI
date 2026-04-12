import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSessionUser } from "@/lib/supabase-server";
import { serializeError, writeAuditLog } from "@/lib/audit-log";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({
    ok: true,
    user: user
      ? {
          id: user.id,
          email: user.email ?? null,
        }
      : null,
  });
}

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    return NextResponse.json(
      { ok: false, error: { message: "Supabase public config is missing.", code: "missing_config" } },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    accessToken?: string;
    refreshToken?: string;
  };
  const accessToken = body.accessToken?.trim();
  const refreshToken = body.refreshToken?.trim();

  if (!accessToken || !refreshToken) {
    return NextResponse.json(
      { ok: false, error: { message: "accessToken and refreshToken are required.", code: "missing_tokens" } },
      { status: 400 },
    );
  }

  const response = NextResponse.json({ ok: true });
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

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error) {
    await writeAuditLog({
      action: "auth.session.sync.error",
      status: "error",
      metadata: { error: serializeError(error) },
    });
    return NextResponse.json(
      { ok: false, error: { message: "Failed to sync auth session.", code: "session_sync_failed" } },
      { status: 500 },
    );
  }

  await writeAuditLog({
    action: "auth.session.sync",
    userId: data.user?.id ?? null,
    status: "ok",
    metadata: { email: data.user?.email ?? null },
  });

  response.headers.set("Cache-Control", "no-store");
  return response;
}
