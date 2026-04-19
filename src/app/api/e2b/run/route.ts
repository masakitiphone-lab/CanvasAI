import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api-auth";
import type { ConversationAttachment } from "@/lib/canvas-types";
import { persistE2BArtifacts, runE2ECodeSandbox } from "@/lib/e2b-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type E2BRunRequest = {
  code?: string;
  attachments?: ConversationAttachment[];
  contextText?: string;
  projectId?: string;
};

export async function POST(request: Request) {
  const auth = await requireSessionUser(request);
  if (auth.response || !auth.user) {
    return auth.response;
  }

  const payload = (await request.json().catch(() => null)) as E2BRunRequest | null;
  if (!payload?.code?.trim()) {
    return NextResponse.json(
      {
        ok: false,
        error: { message: "Code payload is required." },
      },
      { status: 400 },
    );
  }

  try {
    const result = await runE2ECodeSandbox({
      code: payload.code,
      attachments: payload.attachments ?? [],
      contextText: payload.contextText ?? "",
      projectId: payload.projectId,
      ownerUserId: auth.user.id,
    });

    const uploadedAttachments = result.files.length > 0
      ? await persistE2BArtifacts({
          files: result.files,
          ownerUserId: auth.user.id,
          projectId: payload.projectId,
        })
      : [];

    return NextResponse.json({
      ok: true,
      result: {
        ...result,
        files: uploadedAttachments,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          message: error instanceof Error ? error.message : "E2B execution failed.",
        },
      },
      { status: 500 },
    );
  }
}
