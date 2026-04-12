import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api-auth";
import { storeUploadedAttachment } from "@/lib/attachment-store";
import { writeAuditLog } from "@/lib/audit-log";
import { consumeRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const auth = await requireSessionUser(request);
  if (auth.response || !auth.user) {
    await writeAuditLog({
      action: "attachment.upload.denied",
      status: "error",
      metadata: { reason: "unauthorized" },
    });
    return auth.response;
  }

  const rate = consumeRateLimit({ key: `attachments:file:${auth.user.id}`, scope: "generation" });
  if (!rate.ok) {
    await writeAuditLog({
      action: "attachment.upload.rate_limited",
      userId: auth.user.id,
      status: "error",
    });
    return NextResponse.json(
      {
        ok: false,
        error: {
          message: "Too many attachment uploads. Please wait and try again.",
          code: "rate_limited",
        },
      },
      { status: 429 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const projectId = typeof formData.get("projectId") === "string" ? String(formData.get("projectId")).trim() || null : null;

  if (!(file instanceof File)) {
    await writeAuditLog({
      action: "attachment.upload.invalid",
      userId: auth.user.id,
      projectId,
      status: "error",
      metadata: { reason: "missing_file" },
    });
    return NextResponse.json(
      {
        ok: false,
        error: {
          message: "File is required.",
          code: "missing_file",
        },
      },
      { status: 400 },
    );
  }

  try {
    const attachment = await storeUploadedAttachment({
      file,
      ownerUserId: auth.user.id,
      projectId,
    });

    await writeAuditLog({
      action: "attachment.upload",
      userId: auth.user.id,
      projectId,
      targetType: "attachment",
      targetId: attachment.id,
      metadata: {
        kind: attachment.kind,
        name: attachment.name,
        sizeBytes: attachment.sizeBytes ?? null,
      },
    });

    return NextResponse.json({
      ok: true,
      attachment,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Attachment upload failed.";
    await writeAuditLog({
      action: "attachment.upload.failed",
      userId: auth.user.id,
      projectId,
      status: "error",
      metadata: { message },
    });

    return NextResponse.json(
      {
        ok: false,
        error: {
          message,
          code: "attachment_upload_failed",
        },
      },
      { status: 400 },
    );
  }
}
