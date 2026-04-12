import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api-auth";
import { deleteCanvasState } from "@/lib/canvas-store";
import { serializeError, writeAuditLog } from "@/lib/audit-log";
import { createProjectForUser, getProjectForUser, listProjectsForUser } from "@/lib/project-store";
import { consumeRateLimit } from "@/lib/rate-limit";

type CreateProjectRequest = {
  title?: string;
  projectId?: string;
};

export async function GET() {
  const auth = await requireSessionUser();
  if (auth.response || !auth.user) {
    await writeAuditLog({
      action: "project.list.denied",
      status: "error",
      metadata: { reason: "unauthorized" },
    });
    return auth.response;
  }

  const projects = await listProjectsForUser(auth.user.id);
  return NextResponse.json({ ok: true, projects });
}

export async function POST(request: Request) {
  const auth = await requireSessionUser(request);
  if (auth.response || !auth.user) {
    await writeAuditLog({
      action: "project.create.denied",
      status: "error",
      metadata: { reason: "unauthorized" },
    });
    return auth.response;
  }

  const rate = consumeRateLimit({ key: `projects:create:${auth.user.id}`, scope: "default" });
  if (!rate.ok) {
    return NextResponse.json(
      { ok: false, error: { message: "Too many project creations. Please wait a bit.", code: "rate_limited" } },
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
    await writeAuditLog({
      action: "project.create.error",
      userId: auth.user.id,
      status: "error",
      metadata: { reason: "create_failed", title },
    });
    return NextResponse.json(
      { ok: false, error: { message: "Failed to create project.", code: "create_failed" } },
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
  const auth = await requireSessionUser(request);
  if (auth.response || !auth.user) {
    await writeAuditLog({
      action: "project.delete.denied",
      status: "error",
      metadata: { reason: "unauthorized" },
    });
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId")?.trim();

  if (!projectId) {
    await writeAuditLog({
      action: "project.delete.invalid",
      userId: auth.user.id,
      status: "error",
      metadata: { reason: "missing_project_id" },
    });
    return NextResponse.json(
      { ok: false, error: { message: "projectId is required.", code: "missing_project_id" } },
      { status: 400 },
    );
  }

  const existingProject = await getProjectForUser(auth.user.id, projectId);
  if (!existingProject) {
    await writeAuditLog({
      action: "project.delete.miss",
      userId: auth.user.id,
      projectId,
      status: "error",
      metadata: { reason: "not_found" },
    });
    return NextResponse.json(
      { ok: false, error: { message: "Project not found.", code: "not_found" } },
      { status: 404 },
    );
  }

  try {
    await deleteCanvasState(projectId, auth.user.id);
    await writeAuditLog({
      action: "project.delete",
      userId: auth.user.id,
      projectId,
      targetType: "project",
      targetId: projectId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    await writeAuditLog({
      action: "project.delete.error",
      userId: auth.user.id,
      projectId,
      targetType: "project",
      targetId: projectId,
      status: "error",
      metadata: { error: serializeError(error) },
    });
    return NextResponse.json(
      { ok: false, error: { message: "Failed to delete project.", code: "delete_failed" } },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requireSessionUser(request);
  if (auth.response || !auth.user) {
    await writeAuditLog({
      action: "project.rename.denied",
      status: "error",
      metadata: { reason: "unauthorized" },
    });
    return auth.response;
  }

  const body = (await request.json().catch(() => ({}))) as { projectId?: string; title?: string };
  const projectId = body.projectId?.trim();
  const title = body.title?.trim();

  if (!projectId || !title) {
    return NextResponse.json(
      { ok: false, error: { message: "projectId and title are required.", code: "missing_fields" } },
      { status: 400 },
    );
  }

  const project = await createProjectForUser({
    userId: auth.user.id,
    projectId,
    title,
  });

  if (!project) {
    await writeAuditLog({
      action: "project.rename.error",
      userId: auth.user.id,
      projectId,
      status: "error",
      metadata: { reason: "update_failed", title },
    });
    return NextResponse.json(
      { ok: false, error: { message: "Failed to update project.", code: "update_failed" } },
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
