import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase-server";

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
