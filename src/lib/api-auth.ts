import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase-server";

export async function requireSessionUser() {
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
