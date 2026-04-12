import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit-log";
import { deleteCanvasState } from "@/lib/canvas-store";
import { createProjectForUser, listProjectsForUser } from "@/lib/project-store";
import { consumeRateLimit } from "@/lib/rate-limit";

type CreateProjectRequest = {
  title?: string;
  projectId?: string;
};

export async function GET() {
  const auth = await requireSessionUser();
  if (auth.response || !auth.user) {
    return auth.response;
  }

  const projects = await listProjectsForUser(auth.user.id);
  return NextResponse.json({ ok: true, projects });
}

export async function POST(request: Request) {
  const auth = await requireSessionUser();
  if (auth.response || !auth.user) {
    return auth.response;
  }

  const rate = consumeRateLimit({ key: `projects:create:${auth.user.id}`, scope: "default" });
  if (!rate.ok) {
    return NextResponse.json(
      { ok: false, error: { message: "作成リクエストが多すぎます。しばらくしてから再試行してください。", code: "rate_limited" } },
      { status: 429 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as CreateProjectRequest;
  const title = body.title?.trim() || "Untitled canvas";
  const project = await createProjectForUser({
    userId: auth.user.id,
    title,
    projectId: body.projectId?.trim() || undefined,
  });

  if (!project) {
    return NextResponse.json(
      { ok: false, error: { message: "プロジェクトの作成に失敗しました。", code: "create_failed" } },
      { status: 500 },
    );
  }

  await writeAuditLog({
    action: "project.create",
    userId: auth.user.id,
    projectId: project.id,
    targetType: "project",
    targetId: project.id,
  });

  return NextResponse.json({ ok: true, project });
}

export async function DELETE(request: Request) {
  const auth = await requireSessionUser();
  if (auth.response || !auth.user) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId")?.trim();

  if (!projectId) {
    return NextResponse.json(
      { ok: false, error: { message: "projectId が必要です。", code: "missing_project_id" } },
      { status: 400 },
    );
  }

  await deleteCanvasState(projectId, auth.user.id);
  await writeAuditLog({
    action: "project.delete",
    userId: auth.user.id,
    projectId,
    targetType: "project",
    targetId: projectId,
  });

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const auth = await requireSessionUser();
  if (auth.response || !auth.user) {
    return auth.response;
  }

  const body = (await request.json().catch(() => ({}))) as { projectId?: string; title?: string };
  const projectId = body.projectId?.trim();
  const title = body.title?.trim();

  if (!projectId || !title) {
    return NextResponse.json(
      { ok: false, error: { message: "projectId と title が必要です。", code: "missing_fields" } },
      { status: 400 },
    );
  }

  const project = await createProjectForUser({
    userId: auth.user.id,
    projectId,
    title,
  });

  if (!project) {
    return NextResponse.json(
      { ok: false, error: { message: "プロジェクトの更新に失敗しました。", code: "update_failed" } },
      { status: 500 },
    );
  }

  await writeAuditLog({
    action: "project.rename",
    userId: auth.user.id,
    projectId: project.id,
    targetType: "project",
    targetId: project.id,
  });

  return NextResponse.json({ ok: true, project });
}
