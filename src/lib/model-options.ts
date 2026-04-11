import type {
  ConversationImageModelName,
  ConversationPromptMode,
  ConversationTextModelName,
} from "@/lib/canvas-types";

export const TEXT_MODEL_OPTIONS: Array<{
  value: ConversationTextModelName;
  label: string;
  description: string;
}> = [
  { value: "gemini-3.1-pro", label: "Gemini 3.1 Pro", description: "Advanced intelligence & complex reasoning" },
  { value: "gemini-3.1-flash", label: "Gemini 3.1 Flash", description: "High-speed multimodal performance" },
  { value: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite", description: "Minimal latency for high-volume tasks" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", description: "High-fidelity coding & deep reasoning" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash", description: "Stable & efficient general purpose model" },
];

export const IMAGE_MODEL_OPTIONS: Array<{
  value: ConversationImageModelName;
  label: string;
  description: string;
}> = [
  { value: "gemini-3.1-flash-image", label: "Nano Banana 2", description: "Hyper-fast latest generation generation" },
  { value: "gemini-3-pro-image", label: "Nano Banana Pro", description: "Professional reasoning-based high fidelity" },
  { value: "gemini-2.5-flash-image", label: "Nano Banana", description: "Fast and reliable standard generation" },
  { value: "imagen-4.0-generate-001", label: "Imagen 4.0", description: "Professional photorealistic engine" },
];

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
