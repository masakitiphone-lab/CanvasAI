import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireSessionUser();
  if (auth.response || !auth.user) {
    return auth.response;
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      {
        ok: false,
        error: { message: "Supabase is not configured.", code: "missing_supabase" },
      },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const limitParam = Number(searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.trunc(limitParam), 1), 100) : 20;

  const result = await supabase
    .from("audit_logs")
    .select("id, action, status, project_id, target_id, metadata, occurred_at")
    .eq("user_id", auth.user.id)
    .eq("status", "error")
    .in("action", ["generation.text.error", "generation.image.error"])
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (result.error) {
    return NextResponse.json(
      {
        ok: false,
        error: { message: "Failed to load error logs.", code: "read_failed" },
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    logs: result.data ?? [],
  });
}
