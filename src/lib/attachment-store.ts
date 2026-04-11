import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getSupabaseAdminClient, getSupabaseBucketName } from "@/lib/supabase-server";
import type { AttachmentKind, ConversationAttachment } from "@/lib/canvas-types";

const DATA_DIR = path.join(process.cwd(), "data");
const STORAGE_DIR = path.join(process.cwd(), "public", "storage", "attachments");
const METADATA_FILE = path.join(DATA_DIR, "attachment-metadata.json");
const MAX_IMAGE_BYTES = Number(process.env.MAX_IMAGE_UPLOAD_BYTES ?? 10 * 1024 * 1024);
const MAX_PDF_BYTES = Number(process.env.MAX_PDF_UPLOAD_BYTES ?? 20 * 1024 * 1024);
const MAX_ATTACHMENT_BYTES = Number(process.env.MAX_ATTACHMENT_UPLOAD_BYTES ?? MAX_PDF_BYTES);

type StoredAttachmentRecord = ConversationAttachment & {
  ownerUserId: string;
  projectId?: string | null;
};

type StoredAttachmentMetadata = {
  attachments: StoredAttachmentRecord[];
};

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function sanitizeBaseName(fileName: string) {
  return fileName
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function extensionFromMimeType(mimeType: string) {
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/gif") return ".gif";
  return "";
}

function detectAttachmentKind(file: File): AttachmentKind | null {
  if (file.type.startsWith("image/")) {
    return "image";
  }

  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return "pdf";
  }

  return null;
}

function validateUploadedFile(file: File, kind: AttachmentKind) {
  if (file.size <= 0) {
    throw new Error("Empty files are not allowed.");
  }

  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error("Attachment is too large.");
  }

  if (kind === "image") {
    if (!file.type.startsWith("image/")) {
      throw new Error("Invalid image MIME type.");
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error("Image file is too large.");
    }
  }

  if (kind === "pdf") {
    const isPdfMime = file.type === "application/pdf";
    const isPdfName = file.name.toLowerCase().endsWith(".pdf");
    if (!isPdfMime && !isPdfName) {
      throw new Error("Invalid PDF file.");
    }
    if (file.size > MAX_PDF_BYTES) {
      throw new Error("PDF file is too large.");
    }
  }
}

async function ensureAttachmentStorage() {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(STORAGE_DIR, { recursive: true });
}

async function readMetadataFile(): Promise<StoredAttachmentMetadata> {
  try {
    const raw = await readFile(METADATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as StoredAttachmentMetadata;
    return {
      attachments: Array.isArray(parsed.attachments) ? parsed.attachments : [],
    };
  } catch {
    return { attachments: [] };
  }
}

async function appendMetadataRecord(attachment: StoredAttachmentRecord) {
  const current = await readMetadataFile();
  const existingIndex = current.attachments.findIndex((entry) => entry.id === attachment.id);
  if (existingIndex >= 0) {
    current.attachments[existingIndex] = attachment;
  } else {
    current.attachments.push(attachment);
  }

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(METADATA_FILE, JSON.stringify(current, null, 2), "utf8");
}

export async function findStoredAttachmentByPath(storagePath: string) {
  const current = await readMetadataFile();
  return current.attachments.find((attachment) => attachment.storagePath === storagePath) ?? null;
}

export async function findStoredAttachmentById(attachmentId: string) {
  const current = await readMetadataFile();
  return current.attachments.find((attachment) => attachment.id === attachmentId) ?? null;
}

async function persistSupabaseAttachmentRecord(attachment: StoredAttachmentRecord) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return;
  }

  const result = await supabase.from("attachment_objects").upsert({
    id: attachment.id,
    owner_user_id: attachment.ownerUserId,
    project_id: attachment.projectId ?? null,
    kind: attachment.kind,
    name: attachment.name,
    mime_type: attachment.mimeType ?? null,
    size_bytes: attachment.sizeBytes ?? null,
    url: attachment.url,
    storage_path: attachment.storagePath ?? null,
    created_at: attachment.createdAt,
  });

  if (result.error) {
    throw new Error("Failed to persist attachment metadata.");
  }
}

async function storeAttachmentBuffer(params: {
  buffer: Buffer;
  fileName: string;
  kind: AttachmentKind;
  mimeType?: string;
  ownerUserId: string;
  projectId?: string | null;
}): Promise<ConversationAttachment> {
  const attachmentId = crypto.randomUUID();
  const extension =
    path.extname(params.fileName) ||
    extensionFromMimeType(params.mimeType ?? "") ||
    (params.kind === "pdf" ? ".pdf" : "");
  const safeBaseName = sanitizeBaseName(path.basename(params.fileName, extension)) || "attachment";
  const supabase = getSupabaseAdminClient();

  if (supabase) {
    const objectPath = `${attachmentId}/${safeBaseName}${extension}`;
    const bucket = getSupabaseBucketName();
    const uploadResult = await supabase.storage.from(bucket).upload(objectPath, params.buffer, {
      contentType: params.mimeType || (params.kind === "pdf" ? "application/pdf" : "application/octet-stream"),
      upsert: false,
    });

    if (uploadResult.error) {
      throw new Error("Failed to upload attachment to Supabase Storage.");
    }

    const attachment: StoredAttachmentRecord = {
      id: attachmentId,
      kind: params.kind,
      name: params.fileName,
      mimeType: params.mimeType || undefined,
      sizeBytes: params.buffer.byteLength,
      url: `/api/attachments/object?id=${encodeURIComponent(attachmentId)}`,
      storagePath: objectPath,
      createdAt: new Date().toISOString(),
      ownerUserId: params.ownerUserId,
      projectId: params.projectId ?? null,
    };

    await appendMetadataRecord(attachment);
    await persistSupabaseAttachmentRecord(attachment);
    return attachment;
  }

  if (isProduction()) {
    throw new Error("Local attachment storage fallback is disabled in production.");
  }

  await ensureAttachmentStorage();
  const storedFileName = `${attachmentId}-${safeBaseName}${extension}`;
  const storagePath = path.join(STORAGE_DIR, storedFileName);
  await writeFile(storagePath, params.buffer);

  const attachment: StoredAttachmentRecord = {
    id: attachmentId,
    kind: params.kind,
    name: params.fileName,
    mimeType: params.mimeType || undefined,
    sizeBytes: params.buffer.byteLength,
    url: `/storage/attachments/${storedFileName}`,
    storagePath: storagePath.replaceAll("\\", "/"),
    createdAt: new Date().toISOString(),
    ownerUserId: params.ownerUserId,
    projectId: params.projectId ?? null,
  };

  await appendMetadataRecord(attachment);
  return attachment;
}

export async function storeUploadedAttachment(params: {
  file: File;
  ownerUserId: string;
  projectId?: string | null;
}): Promise<ConversationAttachment> {
  const kind = detectAttachmentKind(params.file);
  if (!kind) {
    throw new Error("Only image and PDF uploads are supported.");
  }

  validateUploadedFile(params.file, kind);
  const buffer = Buffer.from(await params.file.arrayBuffer());

  return storeAttachmentBuffer({
    buffer,
    fileName: params.file.name,
    kind,
    mimeType: params.file.type || undefined,
    ownerUserId: params.ownerUserId,
    projectId: params.projectId ?? null,
  });
}

export async function storeUrlAttachment(params: {
  urlValue: string;
  ownerUserId: string;
  projectId?: string | null;
}): Promise<ConversationAttachment> {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(params.urlValue);
  } catch {
    throw new Error("Invalid URL.");
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Only http and https URLs are supported.");
  }

  if (isProduction() && !getSupabaseAdminClient()) {
    throw new Error("Attachment metadata storage is required in production.");
  }

  const attachment: StoredAttachmentRecord = {
    id: crypto.randomUUID(),
    kind: "url",
    name: parsedUrl.hostname,
    url: parsedUrl.toString(),
    createdAt: new Date().toISOString(),
    ownerUserId: params.ownerUserId,
    projectId: params.projectId ?? null,
  };

  await appendMetadataRecord(attachment);
  await persistSupabaseAttachmentRecord(attachment);
  return attachment;
}

export async function storeGeneratedImageAttachment(params: {
  buffer: Buffer;
  mimeType: string;
  fileName?: string;
  ownerUserId: string;
  projectId?: string | null;
}) {
  return storeAttachmentBuffer({
    buffer: params.buffer,
    fileName: params.fileName ?? `generated-image${extensionFromMimeType(params.mimeType) || ".png"}`,
    kind: "image",
    mimeType: params.mimeType,
    ownerUserId: params.ownerUserId,
    projectId: params.projectId ?? null,
  });
}

export async function readAttachmentBinary(attachment: Pick<ConversationAttachment, "kind" | "mimeType" | "storagePath">) {
  if (attachment.kind === "url") {
    throw new Error("URL attachments cannot be read as binary.");
  }

  const supabase = getSupabaseAdminClient();
  if (supabase && attachment.storagePath && !attachment.storagePath.startsWith(process.cwd())) {
    const bucket = getSupabaseBucketName();
    const result = await supabase.storage.from(bucket).download(attachment.storagePath);

    if (result.error || !result.data) {
      throw new Error("Failed to read attachment from Supabase Storage.");
    }

    const arrayBuffer = await result.data.arrayBuffer();
    return {
      mimeType: attachment.mimeType || result.data.type || "application/octet-stream",
      data: Buffer.from(arrayBuffer),
    };
  }

  if (!attachment.storagePath) {
    throw new Error("Attachment storage path is missing.");
  }

  if (isProduction()) {
    throw new Error("Local attachment storage fallback is disabled in production.");
  }

  const data = await readFile(attachment.storagePath);
  return {
    mimeType: attachment.mimeType || "application/octet-stream",
    data,
  };
}
