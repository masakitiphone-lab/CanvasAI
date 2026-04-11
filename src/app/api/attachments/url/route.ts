import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api-auth";
import { storeUrlAttachment } from "@/lib/attachment-store";
import { writeAuditLog } from "@/lib/audit-log";
import { consumeRateLimit } from "@/lib/rate-limit";

type CreateUrlAttachmentRequest = {
  url?: string;
  projectId?: string;
};

export async function POST(request: Request) {
  const auth = await requireSessionUser();
  if (auth.response || !auth.user) {
    return auth.response;
  }

  const rate = consumeRateLimit({ key: `attachments:url:${auth.user.id}`, scope: "generation" });
  if (!rate.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          message: "URL 添付の作成が多すぎます。少し待ってからやり直してください。",
          code: "rate_limited",
        },
      },
      { status: 429 },
    );
  }

  const body = (await request.json()) as CreateUrlAttachmentRequest;
  const url = body.url?.trim();
  const projectId = body.projectId?.trim() || null;

  if (!url) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          message: "URL が指定されていません。",
          code: "missing_url",
        },
      },
      { status: 400 },
    );
  }

  try {
    const attachment = await storeUrlAttachment({
      urlValue: url,
      ownerUserId: auth.user.id,
      projectId,
    });

    await writeAuditLog({
      action: "attachment.url",
      userId: auth.user.id,
      projectId,
      targetType: "attachment",
      targetId: attachment.id,
      metadata: {
        kind: attachment.kind,
        url,
      },
    });

    return NextResponse.json({
      ok: true,
      attachment,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "URL 添付の作成に失敗しました。";

    return NextResponse.json(
      {
        ok: false,
        error: {
          message,
          code: "attachment_url_failed",
        },
      },
      { status: 400 },
    );
  }
}
