import { NextResponse } from "next/server";
import { readAttachmentBinary } from "@/lib/attachment-store";
import { storeGeneratedImageAttachment } from "@/lib/attachment-store";
import { requireSessionUser } from "@/lib/api-auth";
import { serializeError, writeAuditLog } from "@/lib/audit-log";
import { consumeCredits, estimateCreditCost, refundCredits } from "@/lib/credit-ledger";
import { consumeRateLimit } from "@/lib/rate-limit";
import type { ConversationAttachment, ConversationTextModelName, ConversationToolName } from "@/lib/canvas-types";

export const runtime = "nodejs";
export const maxDuration = 60;

const CODE_EXECUTION_MODEL: ConversationTextModelName = "gemini-3-flash-preview";
const CODE_SYSTEM_INSTRUCTION = [
  "You are executing coding tasks for a canvas app.",
  "Always decide whether Python code execution is useful.",
  "When code execution is used, return a concise explanation, the generated code, and the execution result.",
  "Keep the explanation brief and grounded in the actual execution result.",
  "If execution fails, say what failed and include the failed output.",
  "Today's date is 2026-04-15.",
].join(" ");

type LineageEntry = {
  id: string;
  kind: "user" | "ai" | "code" | "result" | "image" | "file" | "note";
  content: string;
  attachments?: Array<{
    id: string;
    kind: "image" | "pdf" | "url";
    name: string;
    url: string;
    mimeType?: string;
    storagePath?: string;
  }>;
};

type GenerateCodeRequestBody = {
  targetNodeId?: string;
  lineage?: LineageEntry[];
  model?: {
    provider?: "gemini";
    name?: ConversationTextModelName;
  };
  projectId?: string;
  enabledTools?: ConversationToolName[];
};

type GenerateCodeSuccessResponse = {
  ok: true;
  model: string;
  explanation: string;
  code: string;
  codeLanguage: string;
  codeContent: string;
  resultContent: string;
  resultAttachments: ConversationAttachment[];
  executionOutput: string;
  executionOutcome: string;
  tokenCount?: number | null;
  chargedCredits: number;
  balance: number;
};

type UploadedGeminiFile = {
  name: string;
  uri: string;
  mimeType: string;
};

type GeminiCodePart = {
  text?: string;
  executableCode?: {
    language?: string;
    code?: string;
  };
  codeExecutionResult?: {
    outcome?: string;
    output?: string;
  };
  inlineData?: {
    mimeType?: string;
    data?: string;
  };
};

type GeminiTool = {
  code_execution?: Record<string, never>;
  google_search?: Record<string, never>;
};

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiCodePart[];
    };
  }>;
  usageMetadata?: {
    totalTokenCount?: number;
  };
  error?: {
    message?: string;
    status?: string;
  };
};

function jsonError(message: string, code: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      error: { message, code },
    },
    { status },
  );
}

async function uploadGeminiFile(params: {
  apiKey: string;
  mimeType: string;
  displayName: string;
  data: Buffer;
}): Promise<UploadedGeminiFile> {
  const startResponse = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${params.apiKey}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(params.data.byteLength),
      "X-Goog-Upload-Header-Content-Type": params.mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      file: {
        display_name: params.displayName,
      },
    }),
  });

  if (!startResponse.ok) {
    throw new Error("Failed to start Gemini Files upload.");
  }

  const uploadUrl = startResponse.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    throw new Error("Gemini Files upload URL was missing.");
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(params.data.byteLength),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: new Uint8Array(params.data),
  });

  const payload = (await uploadResponse.json()) as {
    file?: {
      name?: string;
      uri?: string;
      mimeType?: string;
    };
  };

  if (!uploadResponse.ok || !payload.file?.name || !payload.file.uri) {
    throw new Error("Failed to finalize Gemini Files upload.");
  }

  return {
    name: payload.file.name,
    uri: payload.file.uri,
    mimeType: payload.file.mimeType ?? params.mimeType,
  };
}

async function deleteGeminiFile(apiKey: string, fileName: string) {
  await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`, {
    method: "DELETE",
  });
}

async function buildGeminiParts(lineage: LineageEntry[], apiKey: string) {
  const uploadedFiles: UploadedGeminiFile[] = [];
  const parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
    | { file_data: { mime_type: string; file_uri: string } }
  > = [
    {
      text: [
        "Conversation history follows.",
        "Focus on the latest user prompt.",
        "Use Python code execution when it helps produce a correct result.",
      ].join("\n"),
    },
  ];

  for (const [index, entry] of lineage.entries()) {
    const roleLabel =
      entry.kind === "user"
        ? "User"
        : entry.kind === "ai"
          ? "Assistant"
          : entry.kind === "code"
            ? "Generated Code"
            : entry.kind === "result"
              ? "Execution Result"
            : entry.kind === "note"
              ? "Note"
              : entry.kind === "file"
                ? "File"
                : "Image";

    parts.push({
      text: `${index + 1}. ${roleLabel}\n${entry.content}`,
    });

    for (const attachment of entry.attachments ?? []) {
      if (attachment.kind === "url") {
        parts.push({
          text: `Related URL: ${attachment.name} (${attachment.url})`,
        });
        continue;
      }

      const binary = await readAttachmentBinary(attachment);

      if (attachment.kind === "pdf") {
        const uploadedFile = await uploadGeminiFile({
          apiKey,
          mimeType: binary.mimeType,
          displayName: attachment.name,
          data: binary.data,
        });

        uploadedFiles.push(uploadedFile);
        parts.push({
          file_data: {
            mime_type: uploadedFile.mimeType,
            file_uri: uploadedFile.uri,
          },
        });
        continue;
      }

      parts.push({
        inlineData: {
          mimeType: binary.mimeType,
          data: binary.data.toString("base64"),
        },
      });
    }
  }

  return {
    parts,
    uploadedFiles,
  };
}

function extractCodeParts(payload: GeminiGenerateResponse) {
  const parts = payload.candidates?.[0]?.content?.parts ?? [];
  const explanation = parts
    .map((part) => part.text ?? "")
    .join("\n")
    .trim();
  const executableCode = parts.find((part) => part.executableCode?.code)?.executableCode;
  const executionResult = parts.find((part) => part.codeExecutionResult)?.codeExecutionResult;

  return {
    explanation,
    code: executableCode?.code?.trim() ?? "",
    language: executableCode?.language?.trim() ?? "PYTHON",
    outcome: executionResult?.outcome?.trim() ?? "OUTCOME_UNSPECIFIED",
    output: executionResult?.output ?? "",
  };
}

function buildCodeContent(params: { prompt: string; language: string; code: string }) {
  return [
    "## Prompt",
    params.prompt.trim() || "(empty)",
    "",
    "## Generated Code",
    `\`\`\`${params.language.toLowerCase()}\n${params.code || "# No code returned"}\n\`\`\``,
  ].join("\n");
}

function buildResultContent(params: {
  explanation: string;
  outcome: string;
  output: string;
}) {
  return [
    "## Summary",
    params.explanation || "No summary returned.",
    "",
    "## Outcome",
    params.outcome,
    "",
    "## Output",
    "```text",
    params.output || "(no output)",
    "```",
  ].join("\n");
}

async function extractResultAttachments(params: {
  parts: GeminiCodePart[];
  ownerUserId: string;
  projectId?: string | null;
}) {
  const attachments: ConversationAttachment[] = [];

  for (const [index, part] of params.parts.entries()) {
    const inlineData = part.inlineData;
    if (!inlineData?.mimeType?.startsWith("image/") || !inlineData.data) {
      continue;
    }

    const extension = inlineData.mimeType.split("/")[1] ?? "png";
    const attachment = await storeGeneratedImageAttachment({
      buffer: Buffer.from(inlineData.data, "base64"),
      mimeType: inlineData.mimeType,
      fileName: `gemini-code-result-${index + 1}.${extension}`,
      ownerUserId: params.ownerUserId,
      projectId: params.projectId ?? null,
    });
    attachments.push(attachment);
  }

  return attachments;
}

function getLatestUserPrompt(lineage: LineageEntry[]) {
  for (let index = lineage.length - 1; index >= 0; index -= 1) {
    if (lineage[index]?.kind === "user") {
      return lineage[index]?.content.trim() ?? "";
    }
  }

  return "";
}

export async function POST(request: Request) {
  let authUserId: string | null = null;
  let projectId: string | null = null;
  let requestId: string | null = null;
  let cost = 0;
  let apiKey = "";
  let uploadedFiles: UploadedGeminiFile[] = [];

  try {
    const auth = await requireSessionUser(request);
    if (auth.response || !auth.user) {
      await writeAuditLog({
        action: "generation.code.rejected",
        status: "error",
        metadata: { reason: "missing_session" },
      });
      return auth.response;
    }
    authUserId = auth.user.id;

    const rate = consumeRateLimit({ key: `generation:code:${auth.user.id}`, scope: "generation" });
    if (!rate.ok) {
      await writeAuditLog({
        action: "generation.code.rejected",
        userId: auth.user.id,
        status: "error",
        metadata: { scope: "generation", reason: "rate_limited" },
      });
      return jsonError("Too many code generation requests. Please wait a moment and try again.", "rate_limited", 429);
    }

    apiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
    if (!apiKey) {
      await writeAuditLog({
        action: "generation.code.error",
        userId: auth.user.id,
        status: "error",
        metadata: { reason: "missing_api_key" },
      });
      return jsonError("GEMINI_API_KEY is not configured.", "missing_api_key", 500);
    }

    const body = (await request.json()) as GenerateCodeRequestBody;
    const targetNodeId = body.targetNodeId?.trim();
    const lineage = body.lineage ?? [];
    projectId = body.projectId?.trim() || null;
    const requestedTools = new Set(body.enabledTools ?? []);
    const tools: GeminiTool[] = [{ code_execution: {} }];
    if (requestedTools.has("google-search")) {
      tools.push({ google_search: {} });
    }

    if (!targetNodeId || lineage.length === 0) {
      await writeAuditLog({
        action: "generation.code.rejected",
        userId: auth.user.id,
        projectId,
        status: "error",
        metadata: { reason: "missing_lineage_or_target", targetNodeId, lineageLength: lineage.length },
      });
      return jsonError("targetNodeId and lineage are required.", "missing_lineage", 400);
    }

    cost = estimateCreditCost({
      promptMode: "code",
      modelName: CODE_EXECUTION_MODEL,
      attachmentCount: lineage.reduce((count, entry) => count + (entry.attachments?.length ?? 0), 0),
    });
    requestId = crypto.randomUUID();

    const debit = await consumeCredits({
      userId: auth.user.id,
      projectId,
      amount: cost,
      reason: "generation_code",
      modelName: CODE_EXECUTION_MODEL,
      promptMode: "code",
      requestId,
      metadata: {
        targetNodeId,
        lineageLength: lineage.length,
      },
    });

    if (!debit.ok) {
      return jsonError(
        `Not enough credits. Required: ${debit.required}, available: ${debit.balance}.`,
        "insufficient_credits",
        402,
      );
    }

    const built = await buildGeminiParts(lineage, apiKey);
    uploadedFiles = built.uploadedFiles;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${CODE_EXECUTION_MODEL}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: CODE_SYSTEM_INSTRUCTION }],
        },
        contents: [{ role: "user", parts: built.parts }],
        tools,
      }),
    });

    const payload = (await response.json()) as GeminiGenerateResponse;
    if (!response.ok) {
      await refundCredits({
        userId: auth.user.id,
        projectId,
        amount: cost,
        reason: "generation_code_failed",
        modelName: CODE_EXECUTION_MODEL,
        promptMode: "code",
        requestId,
        metadata: { status: payload.error?.status ?? "request_failed" },
      });
      return jsonError(
        payload.error?.message ?? "Gemini code execution request failed.",
        payload.error?.status ?? "gemini_code_request_failed",
        response.status,
      );
    }

    const parts = payload.candidates?.[0]?.content?.parts ?? [];
    const result = extractCodeParts(payload);
    const latestPrompt = getLatestUserPrompt(lineage);
    const resultAttachments = await extractResultAttachments({
      parts,
      ownerUserId: auth.user.id,
      projectId,
    });
    const codeContent = buildCodeContent({
      prompt: latestPrompt,
      language: result.language,
      code: result.code,
    });
    const resultContent = buildResultContent({
      explanation: result.explanation,
      outcome: result.outcome,
      output: result.output,
    });

    await writeAuditLog({
      action: "generation.code",
      userId: auth.user.id,
      projectId,
      targetType: "generation",
      targetId: requestId,
      metadata: {
        modelName: CODE_EXECUTION_MODEL,
        promptMode: "code",
        tokenCount: payload.usageMetadata?.totalTokenCount ?? null,
        chargedCredits: cost,
        outcome: result.outcome,
      },
    });

    return NextResponse.json<GenerateCodeSuccessResponse>({
      ok: true,
      model: CODE_EXECUTION_MODEL,
      explanation: result.explanation,
      code: result.code,
      codeLanguage: result.language,
      codeContent,
      resultContent,
      resultAttachments,
      executionOutput: result.output,
      executionOutcome: result.outcome,
      tokenCount: payload.usageMetadata?.totalTokenCount ?? null,
      chargedCredits: cost,
      balance: debit.balance,
    });
  } catch (error) {
    const errorInfo = serializeError(error);
    const message = errorInfo.message;

    if (authUserId && requestId && cost > 0) {
      await Promise.allSettled([
        refundCredits({
          userId: authUserId,
          projectId,
          amount: cost,
          reason: "generation_code_failed",
          modelName: CODE_EXECUTION_MODEL,
          promptMode: "code",
          requestId,
          metadata: { message },
        }),
        writeAuditLog({
          action: "generation.code.error",
          userId: authUserId,
          projectId,
          targetType: "generation",
          targetId: requestId,
          status: "error",
          metadata: {
            modelName: CODE_EXECUTION_MODEL,
            promptMode: "code",
            chargedCredits: cost,
            requestId,
            error: errorInfo,
          },
        }),
      ]);
    }

    return jsonError(message, "generation_code_route_failed", 500);
  } finally {
    if (apiKey && uploadedFiles.length > 0) {
      await Promise.allSettled(uploadedFiles.map((file) => deleteGeminiFile(apiKey, file.name)));
    }
  }
}
