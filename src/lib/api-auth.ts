import { NextResponse } from "next/server";
import { getSessionUser, getSupabaseAdminClient } from "@/lib/supabase-server";

function readBearerToken(request?: Request) {
  const authorization = request?.headers.get("authorization")?.trim();
  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function requireSessionUser(request?: Request) {
  const bearerToken = readBearerToken(request);
  if (bearerToken) {
    const supabase = getSupabaseAdminClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser(bearerToken);

      if (user) {
        return { user, response: null };
      }
    }
  }

  const user = await getSessionUser();

  if (!user) {
    return {
      user: null,
      response: NextResponse.json(
        {
          ok: false,
          error: {
            message: "ログインが必要です。",
            code: "unauthorized",
          },
        },
        { status: 401 },
      ),
    };
  }

  return { user, response: null };
}
