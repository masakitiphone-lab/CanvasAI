import type {
  ConversationModelName,
  ConversationImageModelName,
  ConversationPromptMode,
  ConversationTextModelName,
} from "@/lib/canvas-types";

export const TEXT_MODEL_OPTIONS: Array<{ value: ConversationTextModelName; label: string; description: string }> = [
  { value: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview", description: "Fast preview model for general generation" },
  { value: "gemini-3-pro-preview", label: "Gemini 3 Pro Preview", description: "Preview flagship reasoning model" },
];

export const IMAGE_MODEL_OPTIONS: Array<{
  value: ConversationImageModelName;
  label: string;
  description: string;
}> = [
  { value: "gemini-2.5-flash-image", label: "Nano Banana", description: "Google's Gemini 2.5 Flash Image model" },
  { value: "gemini-3.1-flash-image-preview", label: "Nano Banana 2", description: "Google's Gemini 3.1 Flash Image Preview model" },
  { value: "gemini-3-pro-image-preview", label: "Nano Banana Pro", description: "Google's Gemini 3 Pro Image Preview model" },
  { value: "imagen-4.0-generate-001", label: "Imagen 4.0", description: "Professional photorealistic engine" },
];

const LEGACY_MODEL_ALIASES: Partial<Record<string, ConversationModelName>> = {
  "gemini-3.1-pro": "gemini-3-pro-preview",
  "gemini-3.1-flash": "gemini-3-flash-preview",
  "gemini-3-flash": "gemini-3-flash-preview",
  "gemini-2.5-flash": "gemini-3-flash-preview",
  "gemini-2.5-pro": "gemini-3-pro-preview",
  "gemini-2.5-flash-lite": "gemini-3-flash-preview",
  "gemini-3.1-flash-image": "gemini-3.1-flash-image-preview",
  "gemini-3-pro-image": "gemini-3-pro-image-preview",
};

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
  const normalizedValue = (value && LEGACY_MODEL_ALIASES[value]) || value;

  if (promptMode === "image-create") {
    if (isSupportedImageModelName(normalizedValue)) {
      return normalizedValue;
    }
    return getDefaultModelForPromptMode(promptMode, settings);
  }

  if (isSupportedTextModelName(normalizedValue)) {
    return normalizedValue;
  }

  return getDefaultModelForPromptMode(promptMode, settings);
}

export function getDefaultModelForPromptMode(
  promptMode: ConversationPromptMode,
  settings?: { defaultTextModel?: string; defaultImageModel?: string }
) {
  if (promptMode === "image-create") {
    const normalizedImageModel = (settings?.defaultImageModel && LEGACY_MODEL_ALIASES[settings.defaultImageModel]) || settings?.defaultImageModel;
    if (isSupportedImageModelName(normalizedImageModel)) {
      return normalizedImageModel;
    }
    return "gemini-3.1-flash-image-preview";
  }

  if (promptMode === "code") {
    return "gemini-3-flash-preview";
  }
  
  const normalizedTextModel = (settings?.defaultTextModel && LEGACY_MODEL_ALIASES[settings.defaultTextModel]) || settings?.defaultTextModel;
  if (isSupportedTextModelName(normalizedTextModel)) {
    return normalizedTextModel;
  }

  if (promptMode === "deep-research") return "gemini-3-pro-preview";
  return "gemini-3-flash-preview";
}
