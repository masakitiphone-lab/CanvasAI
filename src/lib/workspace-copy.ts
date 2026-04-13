export const CANVAS_COPY = {
  syncIndicator: "Synchronizing with cloud...",
  fileUploadFailed: "Failed to upload file.",
  geminiRequestFailed: "Gemini request failed.",
  geminiStreamFailed: "Gemini stream ended unexpectedly.",
  imageRequestFailed: "Image generation request failed.",
  attachmentUploadFailed: "Failed to upload attachment.",
  deepResearchUnavailable: "Deep Research is not available for the selected model.",
  generateFailedPrefix: "Generation failed.",
  imageGenerateFailedPrefix: "Image generation failed.",
} as const;

export const SETTINGS_COPY = {
  creditsDescription: "Credits are consumed when you run text or image generation.",
} as const;

export const PLANS_COPY = {
  intro: "Choose the plan that matches your usage.",
  freeDescription: "Basic access for evaluation and light usage.",
  proDescription: "Higher limits and better models for regular work.",
  teamDescription: "Shared usage and admin controls for teams.",
  rolloutDescription: "Plan changes roll out gradually to keep upgrades stable.",
} as const;
