import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { getSupabaseAdminClient } from "@/lib/supabase-server";

const DATA_DIR = path.join(process.cwd(), "data");
const AUDIT_LOG_FILE = path.join(DATA_DIR, "audit-log.jsonl");

type AuditEvent = {
  action: string;
  userId?: string | null;
  projectId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  status?: "ok" | "error";
  metadata?: Record<string, unknown>;
};

export function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
      cause:
        error.cause instanceof Error
          ? {
              name: error.cause.name,
              message: error.cause.message,
            }
          : error.cause ?? null,
    };
  }

  return {
    name: "UnknownError",
    message: typeof error === "string" ? error : "unknown_error",
    stack: null,
    cause: null,
  };
}

export async function writeAuditLog(event: AuditEvent) {
  const record = {
    id: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    action: event.action,
    userId: event.userId ?? null,
    projectId: event.projectId ?? null,
    targetType: event.targetType ?? null,
    targetId: event.targetId ?? null,
    status: event.status ?? "ok",
    metadata: event.metadata ?? {},
  };

  // Skip file logging in Vercel or production environments where the FS is read-only
  const isVercel = !!process.env.VERCEL;
  if (!isVercel) {
    try {
      await mkdir(DATA_DIR, { recursive: true });
      await appendFile(AUDIT_LOG_FILE, `${JSON.stringify(record)}\n`, "utf8");
    } catch (err) {
      console.warn("Local audit log write failed (may be expected in production):", err);
    }
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return;
  }

  try {
    await supabase.from("audit_logs").insert({
      id: record.id,
      user_id: record.userId,
      project_id: record.projectId,
      action: record.action,
      target_type: record.targetType,
      target_id: record.targetId,
      status: record.status,
      metadata: record.metadata,
      occurred_at: record.occurredAt,
    });
  } catch (error) {
    console.warn("Supabase audit log write failed:", error);
  }
}
