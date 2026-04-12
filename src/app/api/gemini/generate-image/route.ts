import { NextResponse } from "next/server";
import type { LineageEntry } from "@/lib/build-lineage-context";
import { requireSessionUser } from "@/lib/api-auth";
import { readAttachmentBinary, storeGeneratedImageAttachment } from "@/lib/attachment-store";
import { serializeError, writeAuditLog } from "@/lib/audit-log";
import type { ConversationAttachment, ConversationImageModelName } from "@/lib/canvas-types";
import { consumeCredits, estimateCreditCost, refundCredits } from "@/lib/credit-ledger";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const GEMINI_IMAGE_MODEL: ConversationImageModelName = "gemini-2.5-flash-image";

type GenerateImageRequestBody = {
  prompt?: string;
  attachments?: ConversationAttachment[];
  lineage?: LineageEntry[];
  modelName?: ConversationImageModelName;
  projectId?: string;
};

type GeminiGenerateImagePayload = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: {
          mimeType?: string;
          data?: string;
        };
        inline_data?: {
          mime_type?: string;
          data?: string;
        };
      }>;
    };
    finishReason?: string;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
  error?: {
    message?: string;
    status?: string;
  };
  usageMetadata?: {
    totalTokenCount?: number;
  };
};

type GeminiImageResponse = {
  response: Response;
  payload: GeminiGenerateImagePayload;
};

type ImagenPredictPayload = {
  predictions?: Array<{
    bytesBase64Encoded?: string;
    mimeType?: string;
  }>;
  error?: {
    message?: string;
    status?: string;
  };
};

type ImagenPredictResponse = {
  response: Response;
  payload: ImagenPredictPayload;
};

function extensionForMimeType(mimeType: string) {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/gif") return ".gif";
  return ".png";
}

function getCandidateParts(payload: GeminiGenerateImagePayload) {
  return (payload.candidates ?? []).flatMap((candidate) => candidate.content?.parts ?? []);
}

function getImageBlobs(payload: GeminiGenerateImagePayload) {
  return getCandidateParts(payload)
    .map((part) =>
      part.inlineData ??
      (part.inline_data
        ? {
            mimeType: part.inline_data.mime_type,
            data: part.inline_data.data,
          }
        : undefined),
    )
    .filter((part): part is { mimeType?: string; data?: string } => Boolean(part?.data));
}

function getTextResponse(payload: GeminiGenerateImagePayload) {
  return getCandidateParts(payload)
    .map((part) => part.text?.trim())
    .filter((text): text is string => Boolean(text))
    .join("\n\n");
}

async function buildImageParts(prompt: string, attachments: ConversationAttachment[]) {
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{ text: prompt }];

  for (const attachment of attachments) {
    if (attachment.kind !== "image") {
      continue;
    }

    const binary = await readAttachmentBinary(attachment);
    parts.push({
      inlineData: {
        mimeType: binary.mimeType,
        data: binary.data.toString("base64"),
      },
    });
  }

  return parts;
}

function buildPromptFromLineage(lineage: LineageEntry[] | undefined, fallbackPrompt: string) {
  if (!lineage || lineage.length === 0) {
    return fallbackPrompt;
  }

  const context = lineage
    .map((entry) => {
      const content = entry.content.trim();
      if (!content) {
        return null;
      }

      const label =
        entry.kind === "user"
          ? "User"
          : entry.kind === "ai"
            ? "AI"
            : entry.kind === "image"
              ? "Image"
              : entry.kind === "file"
                ? "File"
                : "Note";

      return `${label}: ${content}`;
    })
    .filter((value): value is string => Boolean(value))
    .join("\n");

  return context
    ? [
        "Create one image using the full conversation context below.",
        "Prioritize the latest user request, but use earlier nodes as context, subject details, and constraints.",
        "Return an image, not text.",
        "",
        context,
      ].join("\n")
    : fallbackPrompt;
}

function collectImageAttachments(directAttachments: ConversationAttachment[], lineage: LineageEntry[] | undefined) {
  const attachments = [...directAttachments];
  const seenIds = new Set(attachments.map((attachment) => attachment.id));

  for (const entry of lineage ?? []) {
    for (const attachment of entry.attachments) {
      if (attachment.kind !== "image" || seenIds.has(attachment.id)) {
        continue;
      }

      attachments.push(attachment);
      seenIds.add(attachment.id);
    }
  }

  return attachments;
}

function buildImageRetryPrompt(prompt: string) {
  return [
    "Create one finished image that directly satisfies the user's request.",
    "Return an image, not text.",
    "If the request is brief or vague, make a reasonable visual interpretation instead of refusing.",
    `User request: ${prompt}`,
  ].join("\n");
}

function isImagenModel(modelName: ConversationImageModelName) {
  return modelName === "imagen-4.0-generate-001";
}

async function requestGeminiImageGeneration(params: {
  apiKey: string;
  prompt: string;
  attachments: ConversationAttachment[];
  modelName: ConversationImageModelName;
}): Promise<GeminiImageResponse> {
  const parts = await buildImageParts(params.prompt, params.attachments);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${params.modelName}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": params.apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: {
            aspectRatio: "16:9",
            imageSize: "2K",
          },
        },
      }),
    },
  );

  const payload = (await response.json()) as GeminiGenerateImagePayload;
  return { response, payload };
}

async function requestImagenGeneration(params: {
  apiKey: string;
  prompt: string;
  modelName: ConversationImageModelName;
}): Promise<ImagenPredictResponse> {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${params.modelName}:predict`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": params.apiKey,
    },
    body: JSON.stringify({
      instances: [{ prompt: params.prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio: "16:9",
      },
    }),
  });

  const payload = (await response.json()) as ImagenPredictPayload;
  return { response, payload };
}

export async function POST(request: Request) {
  const auth = await requireSessionUser(request);
  if (auth.response || !auth.user) {
    await writeAuditLog({
      action: "generation.image.rejected",
      status: "error",
      metadata: { reason: "missing_session" },
    });
    return auth.response;
  }

  const rate = consumeRateLimit({ key: `generation:image:${auth.user.id}`, scope: "generation" });
  if (!rate.ok) {
    await writeAuditLog({
      action: "generation.image.rejected",
      userId: auth.user.id,
      status: "error",
      metadata: { scope: "generation", reason: "rate_limited" },
    });
    return NextResponse.json(
      {
        ok: false,
        error: {
          message: "Too many image generation requests. Please wait a moment and try again.",
          code: "rate_limited",
        },
      },
      { status: 429 },
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    await writeAuditLog({
      action: "generation.image.error",
      userId: auth.user.id,
      status: "error",
      metadata: { reason: "missing_api_key" },
    });
    return NextResponse.json(
      {
        ok: false,
        error: {
          message: "GEMINI_API_KEY is not configured.",
          code: "missing_api_key",
        },
      },
      { status: 500 },
    );
  }

  const body = (await request.json()) as GenerateImageRequestBody;
  const prompt = body.prompt?.trim();
  const modelName = body.modelName ?? GEMINI_IMAGE_MODEL;
  const projectId = body.projectId?.trim() || null;

  if (!prompt) {
    await writeAuditLog({
      action: "generation.image.rejected",
      userId: auth.user.id,
      projectId,
      status: "error",
      metadata: { reason: "missing_prompt" },
    });
    return NextResponse.json(
      {
        ok: false,
        error: {
          message: "An image prompt is required.",
          code: "missing_prompt",
        },
      },
      { status: 400 },
    );
  }

  const promptWithContext = buildPromptFromLineage(body.lineage, prompt);
  const attachments = collectImageAttachments(body.attachments ?? [], body.lineage);
  const requestId = crypto.randomUUID();
  const cost = estimateCreditCost({
    promptMode: "image-create",
    modelName,
    attachmentCount: attachments.length,
  });
  const debit = await consumeCredits({
    userId: auth.user.id,
    projectId,
    amount: cost,
    reason: "generation_image",
    modelName,
    promptMode: "image-create",
    requestId,
    metadata: {
      lineageLength: body.lineage?.length ?? 0,
      attachmentCount: attachments.length,
    },
  });

  if (!debit.ok) {
    await writeAuditLog({
      action: "generation.image.rejected",
      userId: auth.user.id,
      projectId,
      status: "error",
      metadata: {
        modelName,
        requiredCredits: debit.required,
        balance: debit.balance,
      },
    });
    return NextResponse.json(
      {
        ok: false,
        error: {
          message: `Not enough credits. Required: ${debit.required}, available: ${debit.balance}.`,
          code: "insufficient_credits",
        },
      },
      { status: 402 },
    );
  }

  try {
    if (isImagenModel(modelName)) {
      const { response, payload } = await requestImagenGeneration({
        apiKey,
        prompt: promptWithContext,
        modelName,
      });

      if (!response.ok) {
        await refundCredits({
          userId: auth.user.id,
          projectId,
          amount: cost,
          reason: "generation_image_failed",
          modelName,
          promptMode: "image-create",
          requestId,
          metadata: { status: payload.error?.status ?? "imagen_failed" },
        });
        await writeAuditLog({
          action: "generation.image.error",
          userId: auth.user.id,
          projectId,
          targetType: "generation",
          targetId: requestId,
          status: "error",
          metadata: {
            modelName,
            chargedCredits: cost,
            code: payload.error?.status ?? "imagen_failed",
            message: payload.error?.message ?? "Imagen request failed.",
          },
        });
        return NextResponse.json(
          {
            ok: false,
            error: {
              message: payload.error?.message ?? "Imagen generation failed.",
              code: payload.error?.status ?? "imagen_generation_failed",
            },
          },
          { status: response.status },
        );
      }

      const storedAttachments = await Promise.all(
        (payload.predictions ?? []).map((prediction, index) =>
          storeGeneratedImageAttachment({
            buffer: Buffer.from(prediction.bytesBase64Encoded ?? "", "base64"),
            mimeType: prediction.mimeType ?? "image/png",
            fileName: `generated-${Date.now()}-${index + 1}${extensionForMimeType(prediction.mimeType ?? "image/png")}`,
            ownerUserId: auth.user.id,
            projectId,
          }),
        ),
      );

      if (storedAttachments.length === 0) {
        await refundCredits({
          userId: auth.user.id,
          projectId,
          amount: cost,
          reason: "generation_image_empty",
          modelName,
          promptMode: "image-create",
          requestId,
        });
        await writeAuditLog({
          action: "generation.image.error",
          userId: auth.user.id,
          projectId,
          targetType: "generation",
          targetId: requestId,
          status: "error",
          metadata: {
            modelName,
            chargedCredits: cost,
            code: "no_image",
          },
        });
        return NextResponse.json(
          {
            ok: false,
            error: {
              message: "Imagen did not return an image.",
              code: "no_image",
            },
          },
          { status: 502 },
        );
      }

      await writeAuditLog({
        action: "generation.image",
        userId: auth.user.id,
        projectId,
        targetType: "generation",
        targetId: requestId,
        metadata: {
          modelName,
          attachmentCount: storedAttachments.length,
          chargedCredits: cost,
        },
      });

      return NextResponse.json({
        ok: true,
        model: modelName,
        attachments: storedAttachments,
        tokenCount: null,
        chargedCredits: cost,
        balance: debit.balance,
      });
    }

    let { response, payload } = await requestGeminiImageGeneration({
      apiKey,
      prompt: promptWithContext,
      attachments,
      modelName,
    });

    if (response.ok && getImageBlobs(payload).length === 0) {
      const retryPrompt = buildImageRetryPrompt(promptWithContext);
      const retried = await requestGeminiImageGeneration({
        apiKey,
        prompt: retryPrompt,
        attachments,
        modelName,
      });
      response = retried.response;
      payload = retried.payload;
    }

    if (!response.ok) {
      await refundCredits({
        userId: auth.user.id,
        projectId,
        amount: cost,
        reason: "generation_image_failed",
        modelName,
        promptMode: "image-create",
        requestId,
        metadata: { status: payload.error?.status ?? "gemini_image_failed" },
      });
      await writeAuditLog({
        action: "generation.image.error",
        userId: auth.user.id,
        projectId,
        targetType: "generation",
        targetId: requestId,
        status: "error",
        metadata: {
          modelName,
          chargedCredits: cost,
          code: payload.error?.status ?? "gemini_image_failed",
          message: payload.error?.message ?? "Gemini image request failed.",
        },
      });
      return NextResponse.json(
        {
          ok: false,
          error: {
            message: payload.error?.message ?? "Gemini image generation failed.",
            code: payload.error?.status ?? "gemini_image_generation_failed",
          },
        },
        { status: response.status },
      );
    }

    const imageBlobs = getImageBlobs(payload);
    if (imageBlobs.length === 0) {
      const textResponse = getTextResponse(payload);
      const finishReasons = (payload.candidates ?? [])
        .map((candidate) => candidate.finishReason)
        .filter((reason): reason is string => Boolean(reason));
      const diagnostic = [payload.promptFeedback?.blockReason, ...finishReasons].filter(Boolean).join(", ");

      await refundCredits({
        userId: auth.user.id,
        projectId,
        amount: cost,
        reason: "generation_image_empty",
        modelName,
        promptMode: "image-create",
        requestId,
        metadata: { diagnostic },
      });
      await writeAuditLog({
        action: "generation.image.error",
        userId: auth.user.id,
        projectId,
        targetType: "generation",
        targetId: requestId,
        status: "error",
        metadata: {
          modelName,
          chargedCredits: cost,
          code: diagnostic || "no_image",
          message: textResponse || "Gemini returned no image.",
        },
      });
      return NextResponse.json(
        {
          ok: false,
          error: {
            message: textResponse || "Gemini did not return an image.",
            code: diagnostic || "no_image",
          },
        },
        { status: 502 },
      );
    }

    const storedAttachments = await Promise.all(
      imageBlobs.map((blob, index) =>
        storeGeneratedImageAttachment({
          buffer: Buffer.from(blob.data ?? "", "base64"),
          mimeType: blob.mimeType ?? "image/png",
          fileName: `generated-${Date.now()}-${index + 1}${extensionForMimeType(blob.mimeType ?? "image/png")}`,
          ownerUserId: auth.user.id,
          projectId,
        }),
      ),
    );

    await writeAuditLog({
      action: "generation.image",
      userId: auth.user.id,
      projectId,
      targetType: "generation",
      targetId: requestId,
      metadata: {
        modelName,
        attachmentCount: storedAttachments.length,
        tokenCount: payload.usageMetadata?.totalTokenCount ?? null,
        chargedCredits: cost,
      },
    });

    return NextResponse.json({
      ok: true,
      model: modelName,
      attachments: storedAttachments,
      tokenCount: payload.usageMetadata?.totalTokenCount ?? null,
      chargedCredits: cost,
      balance: debit.balance,
    });
  } catch (error) {
    const errorInfo = serializeError(error);
    await writeAuditLog({
      action: "generation.image.error",
      userId: auth.user.id,
      projectId,
      targetType: "generation",
      targetId: requestId,
      status: "error",
      metadata: {
        modelName,
        chargedCredits: cost,
        error: errorInfo,
        runtime: process.env.VERCEL ? "vercel" : "local",
      },
    });
    await refundCredits({
      userId: auth.user.id,
      projectId,
      amount: cost,
      reason: "generation_image_failed",
      modelName,
      promptMode: "image-create",
      requestId,
      metadata: {
        error: errorInfo,
      },
    });
    throw error;
  }
}
