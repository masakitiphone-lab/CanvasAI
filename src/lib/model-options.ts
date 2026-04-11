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
  { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (Preview)", description: "Best for complex reasoning and deep exploration" },
  { value: "gemini-3.1-pro", label: "Gemini 3.1 Pro", description: "Stable flagship model for high-fidelity reasoning" },
  { value: "gemini-3.1-flash", label: "Gemini 3.1 Flash", description: "High speed and low latency balanced with intelligence" },
  { value: "gemini-3-flash-preview", label: "Gemini 3 Flash (Preview)", description: "Cost-efficient and hyper-fast responses" },
  { value: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite", description: "Minimal latency for high-volume simple tasks" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", description: "Previous generation stable flagship" },
];

export const IMAGE_MODEL_OPTIONS: Array<{
  value: ConversationImageModelName;
  label: string;
  description: string;
}> = [
  { value: "gemini-3-pro-image-preview", label: "Nano Banana Pro", description: "Advanced reasoning & high-fidelity generation" },
  { value: "imagen-4.0-generate-001", label: "Imagen 4.0", description: "Photorealistic & artistic professional output" },
  { value: "gemini-2.5-flash-image", label: "Nano Banana", description: "Fast, context-aware conversational editing" },
];

export function getDefaultModelForPromptMode(promptMode: ConversationPromptMode) {
  if (promptMode === "image-create") return IMAGE_MODEL_OPTIONS[0].value;
  if (promptMode === "deep-research") return TEXT_MODEL_OPTIONS[0].value;
  return TEXT_MODEL_OPTIONS[1].value;
}
