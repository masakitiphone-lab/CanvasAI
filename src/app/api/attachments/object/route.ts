import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api-auth";
import { findStoredAttachmentById, findStoredAttachmentByPath } from "@/lib/attachment-store";
import { getSupabaseAdminClient, getSupabaseBucketName } from "@/lib/supabase-server";

type AttachmentObjectRow = {
  id: string;
  owner_user_id: string;
  storage_path: string | null;
};

async function resolveAttachmentOwner(params: { attachmentId?: string | null; objectPath?: string | null }) {
  const supabase = getSupabaseAdminClient();

  if (supabase && params.attachmentId) {
    const result = await supabase
      .from("attachment_objects")
      .select("id, owner_user_id, storage_path")
      .eq("id", params.attachmentId)
      .maybeSingle();

    if (result.error) {
      throw new Error("添付ファイル所有権の確認に失敗しました。");
    }

    if (result.data) {
      return result.data as AttachmentObjectRow;
    }
  }

  if (params.attachmentId) {
    const localRecord = await findStoredAttachmentById(params.attachmentId);
    if (localRecord) {
      return {
        id: localRecord.id,
        owner_user_id: localRecord.ownerUserId,
        storage_path: localRecord.storagePath ?? null,
      } satisfies AttachmentObjectRow;
    }
  }

  if (params.objectPath) {
    const localRecord = await findStoredAttachmentByPath(params.objectPath);
    if (localRecord) {
      return {
        id: localRecord.id,
        owner_user_id: localRecord.ownerUserId,
        storage_path: localRecord.storagePath ?? null,
      } satisfies AttachmentObjectRow;
    }
  }

  return null;
}

export async function GET(request: Request) {
  const auth = await requireSessionUser(request);
  if (auth.response || !auth.user) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const attachmentId = searchParams.get("id")?.trim() || null;
  const objectPath = searchParams.get("path")?.trim() || null;

  if (!attachmentId && !objectPath) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          message: "id か path が必要です。",
        },
      },
      { status: 400 },
    );
  }

  const attachment = await resolveAttachmentOwner({ attachmentId, objectPath });
  if (!attachment || !attachment.storage_path) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          message: "添付ファイルが見つかりません。",
        },
      },
      { status: 404 },
    );
  }

  if (attachment.owner_user_id !== auth.user.id) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          message: "この添付ファイルにアクセスする権限がありません。",
        },
      },
      { status: 403 },
    );
  }

  const supabase = getSupabaseAdminClient();

  if (attachment.storage_path.startsWith(process.cwd())) {
    const data = await readFile(attachment.storage_path);
    return new NextResponse(data, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "private, max-age=60",
      },
    });
  }

  if (!supabase) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          message: "Supabase Storage が設定されていません。",
        },
      },
      { status: 500 },
    );
  }

  const bucket = getSupabaseBucketName();
  const result = await supabase.storage.from(bucket).download(attachment.storage_path);

  if (result.error || !result.data) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          message: "添付ファイルの取得に失敗しました。",
        },
      },
      { status: 404 },
    );
  }

  return new NextResponse(result.data, {
    headers: {
      "Content-Type": result.data.type || "application/octet-stream",
      "Cache-Control": "private, max-age=60",
    },
  });
}
