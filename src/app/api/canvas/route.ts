import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api-auth";
import { writeAuditLog } from "@/lib/audit-log";
import { deleteCanvasState, loadCanvasStateForUser, saveCanvasState } from "@/lib/canvas-store";
import { getProjectForUser } from "@/lib/project-store";
import { consumeRateLimit } from "@/lib/rate-limit";
import type { ConversationNodeRecord } from "@/lib/canvas-types";
import type { Edge, Node } from "@xyflow/react";

type SaveCanvasRequest = {
  projectId?: string;
  nodes?: Node<ConversationNodeRecord>[];
  edges?: Edge[];
};

export async function GET(request: Request) {
  const auth = await requireSessionUser();
  if (auth.response || !auth.user) {
    await writeAuditLog({
      action: "canvas.read.denied",
      status: "error",
      metadata: { reason: "unauthorized" },
    });
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId")?.trim();

  if (!projectId) {
    await writeAuditLog({
      action: "canvas.read.invalid",
      userId: auth.user.id,
      status: "error",
      metadata: { reason: "missing_project_id" },
    });
    return NextResponse.json(
      {
        ok: false,
        error: { message: "projectId is required." },
      },
      { status: 400 },
    );
  }

  try {
    const snapshot = await loadCanvasStateForUser(projectId, auth.user.id);

    await writeAuditLog({
      action: snapshot ? "canvas.read" : "canvas.read.miss",
      userId: auth.user.id,
      projectId,
      targetType: "canvas",
      targetId: projectId,
      metadata: snapshot
        ? {
            source: snapshot.source,
            nodeCount: snapshot.nodes.length,
            edgeCount: snapshot.edges.length,
          }
        : { reason: "not_found" },
    });

    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    await writeAuditLog({
      action: "canvas.read.error",
      userId: auth.user.id,
      projectId,
      targetType: "canvas",
      targetId: projectId,
      status: "error",
      metadata: {
        error:
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack ?? null,
              }
            : { name: "UnknownError", message: String(error), stack: null },
      },
    });

    return NextResponse.json(
      {
        ok: false,
        error: { message: "Failed to load canvas." },
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const auth = await requireSessionUser();
  if (auth.response || !auth.user) {
    await writeAuditLog({
      action: "canvas.save.denied",
      status: "error",
      metadata: { reason: "unauthorized" },
    });
    return auth.response;
  }

  const rate = consumeRateLimit({ key: `canvas:save:${auth.user.id}`, scope: "default" });
  if (!rate.ok) {
    await writeAuditLog({
      action: "canvas.save.rate_limited",
      userId: auth.user.id,
      status: "error",
    });
    return NextResponse.json(
      { ok: false, error: { message: "Too many canvas saves.", code: "rate_limited" } },
      { status: 429 },
    );
  }

  const body = (await request.json()) as SaveCanvasRequest;
  const projectId = body.projectId?.trim();

  if (!projectId || !body.nodes || !body.edges) {
    await writeAuditLog({
      action: "canvas.save.invalid",
      userId: auth.user.id,
      projectId: projectId ?? null,
      status: "error",
      metadata: { reason: "missing_fields" },
    });
    return NextResponse.json(
      {
        ok: false,
        error: { message: "projectId, nodes, and edges are required." },
      },
      { status: 400 },
    );
  }

  const existingProject = await getProjectForUser(auth.user.id, projectId);
  const result = await saveCanvasState(
    projectId,
    auth.user.id,
    {
      nodes: body.nodes,
      edges: body.edges,
    },
    {
      title: body.nodes.find((node) => node.data.isRoot)?.data.content.trim() || existingProject?.title || "Untitled canvas",
    },
  );

  await writeAuditLog({
    action: "canvas.save",
    userId: auth.user.id,
    projectId,
    targetType: "canvas",
    targetId: projectId,
  });

  return NextResponse.json({ ok: true, source: result.source });
}

export async function DELETE(request: Request) {
  const auth = await requireSessionUser();
  if (auth.response || !auth.user) {
    await writeAuditLog({
      action: "canvas.delete.denied",
      status: "error",
      metadata: { reason: "unauthorized" },
    });
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId")?.trim();

  if (!projectId) {
    await writeAuditLog({
      action: "canvas.delete.invalid",
      userId: auth.user.id,
      status: "error",
      metadata: { reason: "missing_project_id" },
    });
    return NextResponse.json(
      {
        ok: false,
        error: { message: "projectId is required." },
      },
      { status: 400 },
    );
  }

  const result = await deleteCanvasState(projectId, auth.user.id);
  await writeAuditLog({
    action: "canvas.delete",
    userId: auth.user.id,
    projectId,
    targetType: "canvas",
    targetId: projectId,
  });

  return NextResponse.json({ ok: true, source: result.source });
}
