import { NextResponse } from "next/server";
import { readAttachmentBinary } from "@/lib/attachment-store";
import { requireSessionUser } from "@/lib/api-auth";
import { serializeError, writeAuditLog } from "@/lib/audit-log";
import { consumeCredits, estimateCreditCost, refundCredits } from "@/lib/credit-ledger";
import { consumeRateLimit } from "@/lib/rate-limit";
import type { ConversationPromptMode, ConversationTextModelName, ConversationToolName } from "@/lib/canvas-types";

export const runtime = "nodejs";
export const maxDuration = 60;

const GEMINI_MODEL: ConversationTextModelName = "gemini-2.5-flash";
const MARKDOWN_SYSTEM_INSTRUCTION = [
  "Respond as a normal helpful AI assistant.",
  "Match the user's language unless they ask for a different language.",
  "Use Markdown when it improves readability, but keep the answer natural and not over-formatted.",
  "Use headings, lists, tables, quotes, and code blocks only when they help.",
  "Prefer concise, clear answers and avoid filler.",
  "When writing code, use fenced code blocks with language tags.",
  "Do not emit raw HTML unless it is clearly needed.",
  "Today's date is 2026-04-09.",
  "If Google Search is available, use it only when the request needs current, external, or verifiable information.",
  "When you do search, start broad, compare several relevant sources, and call out meaningful disagreements before concluding.",
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

type GenerateRequestBody = {
  targetNodeId?: string;
  lineage?: LineageEntry[];
  model?: {
    provider?: "gemini";
    name?: ConversationTextModelName;
  };
  projectId?: string;
  promptMode?: ConversationPromptMode;
  enabledTools?: ConversationToolName[];
  stream?: boolean;
};

type GeminiTool = {
  google_search?: Record<string, never>;
  url_context?: Record<string, never>;
};

type UploadedGeminiFile = {
  name: string;
  uri: string;
  mimeType: string;
};

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    groundingMetadata?: {
      groundingChunks?: unknown[];
      searchEntryPoint?: unknown;
      webSearchQueries?: string[];
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

function getLatestUserPrompt(lineage: LineageEntry[]) {
  for (let index = lineage.length - 1; index >= 0; index -= 1) {
    if (lineage[index]?.kind === "user") {
      return lineage[index]?.content.trim() ?? "";
    }
  }

  return "";
}

function shouldEnableGoogleSearch(lineage: LineageEntry[]) {
  const prompt = getLatestUserPrompt(lineage).toLowerCase();

  if (!prompt) {
    return false;
  }

  const currentInfoPattern =
    /\b(latest|current|today|recent|new|news|price|pricing|compare|comparison|release|version|docs|documentation|breaking|announcement|update|202[4-9]|stock|market)\b/;
  const japanesePattern =
    /(最新|現在|今日|最近|ニュース|価格|料金|比較|比較して|リリース|バージョン|ドキュメント|公式|202[4-9]年)/;
  const requiresVerificationPattern =
    /\b(official|source|citation|verify|proof|evidence|roadmap|availability)\b/;

  return currentInfoPattern.test(prompt) || japanesePattern.test(prompt) || requiresVerificationPattern.test(prompt);
}

function buildGeminiTools(params: {
  promptMode: ConversationPromptMode;
  enabledTools?: ConversationToolName[];
  lineage: LineageEntry[];
}) {
  const requestedTools = new Set(params.enabledTools ?? []);
  const tools: GeminiTool[] = [];

  if (requestedTools.has("google-search") || shouldEnableGoogleSearch(params.lineage)) {
    tools.push({ google_search: {} });
  }

  if (
    (params.promptMode === "auto" || params.promptMode === "deep-research") &&
    requestedTools.has("url-context")
  ) {
    tools.push({ url_context: {} });
  }

  return tools;
}

function didUseGoogleSearch(payload: GeminiGenerateResponse) {
  const metadata = payload.candidates?.[0]?.groundingMetadata;
  return Boolean(metadata?.searchEntryPoint || metadata?.groundingChunks?.length || metadata?.webSearchQueries?.length);
}

function jsonError(message: string, code: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      error: { message, code },
    },
    { status },
  );
}

function extractText(payload: GeminiGenerateResponse) {
  return payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
}

function encodeSseData(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function consumeSseEvents(buffer: string) {
  const events = buffer.split(/\r?\n\r?\n/);
  const remainder = events.pop() ?? "";
  return { events, remainder };
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
        "Use any relevant text and attachments when helpful.",
        "Reply to the latest user intent naturally.",
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

async function streamGeminiResponse(params: {
  apiKey: string;
  modelName: string;
  parts: Awaited<ReturnType<typeof buildGeminiParts>>["parts"];
  uploadedFiles: UploadedGeminiFile[];
  tools?: GeminiTool[];
  onDone?: (payload: { text: string; tokenCount: number | null; webSearchUsed: boolean }) => Promise<void>;
  onError?: (message: string) => Promise<void>;
}) {
  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${params.modelName}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": params.apiKey,
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: MARKDOWN_SYSTEM_INSTRUCTION }],
        },
        contents: [{ role: "user", parts: params.parts }],
        ...(params.tools && params.tools.length > 0 ? { tools: params.tools } : {}),
      }),
    },
  );

  if (!upstream.ok || !upstream.body) {
    const payload = (await upstream.json().catch(() => null)) as GeminiGenerateResponse | null;
    throw new Error(payload?.error?.message ?? "Gemini streaming request failed.");
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder("utf-8");
  const reader = upstream.body.getReader();

  let buffer = "";
  let fullText = "";
  let tokenCount: number | null = null;
  let webSearchUsed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(`: ${" ".repeat(2048)}\n\n`));
      controller.enqueue(encoder.encode(encodeSseData({ type: "start", model: params.modelName })));

      const flushEvent = (rawEvent: string) => {
        const dataLines = rawEvent
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .filter(Boolean);

        if (dataLines.length === 0) {
          return;
        }

        const payload = JSON.parse(dataLines.join("\n")) as GeminiGenerateResponse;
        const delta = extractText(payload);
        webSearchUsed ||= didUseGoogleSearch(payload);

        if (payload.usageMetadata?.totalTokenCount != null) {
          tokenCount = payload.usageMetadata.totalTokenCount;
        }

        if (delta) {
          fullText += delta;
          controller.enqueue(encoder.encode(encodeSseData({ type: "text-delta", text: delta })));
        }

        if (payload.error?.message) {
          throw new Error(payload.error.message);
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parsed = consumeSseEvents(buffer);
          buffer = parsed.remainder;

          for (const rawEvent of parsed.events) {
            if (rawEvent.trim()) {
              flushEvent(rawEvent);
            }
          }
        }

        buffer += decoder.decode();
        if (buffer.trim()) {
          flushEvent(buffer);
        }

        if (!fullText.trim()) {
          throw new Error("Gemini returned an empty response.");
        }

        await params.onDone?.({ text: fullText, tokenCount, webSearchUsed });
        controller.enqueue(
          encoder.encode(
            encodeSseData({
              type: "done",
              model: params.modelName,
              text: fullText,
              tokenCount,
              webSearchUsed,
            }),
          ),
        );
        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Gemini streaming failed.";
        await params.onError?.(message);
        controller.enqueue(encoder.encode(encodeSseData({ type: "error", message })));
        controller.close();
      } finally {
        reader.releaseLock();
        await Promise.allSettled(params.uploadedFiles.map((file) => deleteGeminiFile(params.apiKey, file.name)));
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(request: Request) {
  let authUserId: string | null = null;
  let projectId: string | null = null;
  let modelName: ConversationTextModelName = GEMINI_MODEL;
  let promptMode: ConversationPromptMode = "auto";
  let requestId: string | null = null;
  let cost = 0;
  let apiKey = "";
  let uploadedFiles: UploadedGeminiFile[] = [];

  try {
    const auth = await requireSessionUser(request);
    if (auth.response || !auth.user) {
      await writeAuditLog({
        action: "generation.text.rejected",
        status: "error",
        metadata: { reason: "missing_session" },
      });
      return auth.response;
    }
    authUserId = auth.user.id;

    const rate = consumeRateLimit({ key: `generation:text:${auth.user.id}`, scope: "generation" });
    if (!rate.ok) {
      await writeAuditLog({
        action: "generation.text.rejected",
        userId: auth.user.id,
        status: "error",
        metadata: { scope: "generation", reason: "rate_limited" },
      });
      return jsonError("Too many generation requests. Please wait a moment and try again.", "rate_limited", 429);
    }

    apiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
    if (!apiKey) {
      await writeAuditLog({
        action: "generation.text.error",
        userId: auth.user.id,
        status: "error",
        metadata: { reason: "missing_api_key" },
      });
      return jsonError("GEMINI_API_KEY is not configured.", "missing_api_key", 500);
    }

    const body = (await request.json()) as GenerateRequestBody;
    const lineage = body.lineage ?? [];
    modelName = (body.model?.name?.trim() as ConversationTextModelName | undefined) || GEMINI_MODEL;
    const targetNodeId = body.targetNodeId?.trim();
    projectId = body.projectId?.trim() || null;
    promptMode = body.promptMode ?? "auto";

    if (!targetNodeId || lineage.length === 0) {
      await writeAuditLog({
        action: "generation.text.rejected",
        userId: auth.user.id,
        projectId,
        status: "error",
        metadata: { reason: "missing_lineage_or_target", targetNodeId, lineageLength: lineage.length },
      });
      return jsonError("targetNodeId and lineage are required.", "missing_lineage", 400);
    }

    cost = estimateCreditCost({
      promptMode,
      modelName,
      attachmentCount: lineage.reduce((count, entry) => count + (entry.attachments?.length ?? 0), 0),
    });
    requestId = crypto.randomUUID();
    const debit = await consumeCredits({
      userId: auth.user.id,
      projectId,
      amount: cost,
      reason: "generation_text",
      modelName,
      promptMode,
      requestId,
      metadata: {
        targetNodeId,
        lineageLength: lineage.length,
      },
    });

    if (!debit.ok) {
      await writeAuditLog({
        action: "generation.text.rejected",
        userId: auth.user.id,
        projectId,
        status: "error",
        metadata: {
          modelName,
          promptMode,
          requiredCredits: debit.required,
          balance: debit.balance,
        },
      });
      return jsonError(
        `Not enough credits. Required: ${debit.required}, available: ${debit.balance}.`,
        "insufficient_credits",
        402,
      );
    }

    const built = await buildGeminiParts(lineage, apiKey);
    const parts = built.parts;
    uploadedFiles = built.uploadedFiles;
    const tools = buildGeminiTools({
      promptMode,
      enabledTools: body.enabledTools,
      lineage,
    });
    const activeTools = tools.length > 0 ? tools : undefined;

    if (body.stream) {
      return streamGeminiResponse({
        apiKey,
        modelName,
        parts,
        uploadedFiles,
        tools: activeTools,
        onDone: async ({ tokenCount, webSearchUsed }) => {
          await writeAuditLog({
            action: "generation.text",
            userId: auth.user.id,
            projectId,
            targetType: "generation",
            targetId: requestId,
            metadata: {
              modelName,
              promptMode,
              tokenCount,
              webSearchUsed,
              chargedCredits: cost,
            },
          });
        },
        onError: async (message) => {
          await refundCredits({
            userId: auth.user.id,
            projectId,
            amount: cost,
            reason: "generation_text_failed",
            modelName,
            promptMode,
            requestId,
            metadata: { message },
          });
          await writeAuditLog({
            action: "generation.text.error",
            userId: auth.user.id,
            projectId,
            targetType: "generation",
            targetId: requestId,
            status: "error",
            metadata: {
              modelName,
              promptMode,
              chargedCredits: cost,
              message,
            },
          });
        },
      });
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: MARKDOWN_SYSTEM_INSTRUCTION }],
        },
        contents: [{ role: "user", parts }],
        ...(activeTools ? { tools: activeTools } : {}),
      }),
    });

    const payload = (await response.json()) as GeminiGenerateResponse;

    if (!response.ok) {
      await refundCredits({
        userId: auth.user.id,
        projectId,
        amount: cost,
        reason: "generation_text_failed",
        modelName,
        promptMode,
        requestId,
        metadata: { status: payload.error?.status ?? "request_failed" },
      });
      await writeAuditLog({
        action: "generation.text.error",
        userId: auth.user.id,
        projectId,
        targetType: "generation",
        targetId: requestId,
        status: "error",
        metadata: {
          modelName,
          promptMode,
          chargedCredits: cost,
          status: response.status,
          code: payload.error?.status ?? "request_failed",
          message: payload.error?.message ?? "Gemini request failed.",
        },
      });
      return jsonError(
        payload.error?.message ?? "Gemini generateContent request failed.",
        payload.error?.status ?? "gemini_request_failed",
        response.status,
      );
    }

    const text = extractText(payload).trim();
    if (!text) {
      await refundCredits({
        userId: auth.user.id,
        projectId,
        amount: cost,
        reason: "generation_text_empty",
        modelName,
        promptMode,
        requestId,
      });
      await writeAuditLog({
        action: "generation.text.error",
        userId: auth.user.id,
        projectId,
        targetType: "generation",
        targetId: requestId,
        status: "error",
        metadata: {
          modelName,
          promptMode,
          chargedCredits: cost,
          code: "empty_response",
        },
      });
      return jsonError("Gemini returned an empty response.", "empty_response", 502);
    }

    await writeAuditLog({
      action: "generation.text",
      userId: auth.user.id,
      projectId,
      targetType: "generation",
      targetId: requestId,
      metadata: {
        modelName,
        promptMode,
        tokenCount: payload.usageMetadata?.totalTokenCount ?? null,
        webSearchUsed: didUseGoogleSearch(payload),
        chargedCredits: cost,
      },
    });

    return NextResponse.json({
      ok: true,
      model: modelName,
      text,
      tokenCount: payload.usageMetadata?.totalTokenCount ?? null,
      webSearchUsed: didUseGoogleSearch(payload),
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
          reason: "generation_text_failed",
          modelName,
          promptMode,
          requestId,
          metadata: { message },
        }),
        writeAuditLog({
          action: "generation.text.error",
          userId: authUserId,
          projectId,
          targetType: "generation",
          targetId: requestId,
          status: "error",
          metadata: {
            modelName,
            promptMode,
            chargedCredits: cost,
            requestId,
            error: errorInfo,
            runtime: process.env.VERCEL ? "vercel" : "local",
          },
        }),
      ]);
    }

    return jsonError(message, "generation_route_failed", 500);
  } finally {
    if (apiKey && uploadedFiles.length > 0) {
      await Promise.allSettled(uploadedFiles.map((file) => deleteGeminiFile(apiKey, file.name)));
    }
  }
}
