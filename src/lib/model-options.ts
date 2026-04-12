import type {
  ConversationModelName,
  ConversationImageModelName,
  ConversationPromptMode,
  ConversationTextModelName,
} from "@/lib/canvas-types";

export const TEXT_MODEL_OPTIONS: Array<{ value: ConversationTextModelName; label: string; description: string }> = [
  { value: "gemini-3.1-pro", label: "Gemini 3.1 Pro", description: "Flagship intelligence for complex reasoning" },
  { value: "gemini-3.1-flash", label: "Gemini 3.1 Flash", description: "High-speed versatility for general tasks" },
  { value: "gemini-3.1-flash-lite", label: "3.1 Flash-Lite", description: "Ultra-low latency for quick replies" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", description: "Balanced stable reasoning for long context" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash", description: "Cost-effective stable production model" },
];

export const IMAGE_MODEL_OPTIONS: Array<{
  value: ConversationImageModelName;
  label: string;
  description: string;
}> = [
  { value: "gemini-3.1-flash-image", label: "Nano Banana 2", description: "Next-gen character consistency engine" },
  { value: "gemini-3-pro-image", label: "Nano Banana Pro", description: "Advanced conversational image editing" },
  { value: "gemini-2.5-flash-image", label: "Nano Banana", description: "Fast high-fidelity generation base" },
  { value: "imagen-4.0-generate-001", label: "Imagen 4.0", description: "Professional photorealistic engine" },
];

export function isSupportedTextModelName(value: string | undefined): value is ConversationTextModelName {
  return TEXT_MODEL_OPTIONS.some((option) => option.value === value);
}

export function isSupportedImageModelName(value: string | undefined): value is ConversationImageModelName {
  return IMAGE_MODEL_OPTIONS.some((option) => option.value === value);
}

export function normalizeModelName(
  value: string | undefined,
  promptMode: ConversationPromptMode,
  settings?: { defaultTextModel?: string; defaultImageModel?: string },
): ConversationModelName {
  if (promptMode === "image-create") {
    if (isSupportedImageModelName(value)) {
      return value;
    }
    return getDefaultModelForPromptMode(promptMode, settings);
  }

  if (isSupportedTextModelName(value)) {
    return value;
  }

  return getDefaultModelForPromptMode(promptMode, settings);
}

export function getDefaultModelForPromptMode(
  promptMode: ConversationPromptMode,
  settings?: { defaultTextModel?: string; defaultImageModel?: string }
) {
  if (promptMode === "image-create") {
    return (settings?.defaultImageModel as ConversationImageModelName) || IMAGE_MODEL_OPTIONS[0].value;
  }
  
  if (settings?.defaultTextModel) {
    return settings.defaultTextModel as ConversationTextModelName;
  }

  if (promptMode === "deep-research") return TEXT_MODEL_OPTIONS[0].value;
  return TEXT_MODEL_OPTIONS[1].value;
}
