export type NodeKind = "user" | "ai" | "image" | "file" | "note";
export type NodeStatus = "idle" | "generating" | "error" | "outdated" | "orphan";
export type AttachmentKind = "image" | "pdf" | "url";
export type ConversationPromptMode = "auto" | "image-create" | "deep-research";
export type ConversationTextModelName =
  | "gemini-3.1-pro"
  | "gemini-3.1-flash"
  | "gemini-3.1-flash-lite"
  | "gemini-2.5-pro"
  | "gemini-2.5-flash";

export type ConversationImageModelName =
  | "gemini-3.1-flash-image"
  | "gemini-3-pro-image"
  | "gemini-2.5-flash-image"
  | "imagen-4.0-generate-001";

export type ConversationModelName = ConversationTextModelName | ConversationImageModelName;

export type ConversationModelConfig = {
  provider: "gemini";
  name: ConversationModelName;
};

export type ConversationAttachment = {
  id: string;
  kind: AttachmentKind;
  name: string;
  mimeType?: string;
  sizeBytes?: number;
  url: string;
  previewUrl?: string; // Local blob URL for optimistic UI
  storagePath?: string;
  createdAt: string;
};

export type ConversationNodeRecord = {
  parentId: string | null;
  kind: NodeKind;
  content: string;
  attachments: ConversationAttachment[];
  modelConfig?: ConversationModelConfig;
  promptMode?: ConversationPromptMode;
  tokenCount?: number;
  status: NodeStatus;
  createdAt: string;
  isRoot: boolean;
  isPositionPinned: boolean;
};

export type ConversationNodeData = ConversationNodeRecord & {
  isEditing?: boolean;
  isFocusMode?: boolean;
  isFocused?: boolean;
  isMultiDragging?: boolean;
  onAddAttachments?: (files: File[]) => void;
  onRemoveAttachment?: (attachmentId: string) => void;
  onChangeModel?: (modelName: ConversationModelName) => void;
  onChangePromptMode?: (mode: ConversationPromptMode) => void;
  onClearPromptMode?: () => void;
  onResizeNode?: (nextBounds: {
    width: number;
    height: number;
    x: number;
    y: number;
  }) => void;
  onNavigateFocus?: (direction: "parent" | "child") => void;
  onOpenDetail?: (imageUrl?: string) => void;
  onUserContentChange?: (nextValue: string) => void;
  onStartEdit?: () => void;
  onStopEdit?: () => void;
  onGenerateAiReply?: () => void;
  onGenerateImage?: () => void;
  onReplyToAi?: () => void;
  onRegenerateAi?: () => void;
  onRegenerateImage?: () => void;
};
