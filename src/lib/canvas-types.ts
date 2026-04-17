export type NodeKind = "user" | "ai" | "code" | "result" | "image" | "file" | "note";
export type NodeStatus = "idle" | "generating" | "error" | "outdated" | "orphan";
export type AttachmentKind = "image" | "pdf" | "url" | "file";
export type ConversationPromptMode = "auto" | "code" | "image-create" | "deep-research";
export type ConversationToolName = "google-search" | "url-context";
export type ConversationTextModelName =
  | "gemini-3-pro-preview"
  | "gemini-3-flash-preview";

export type ConversationImageModelName =
  | "gemini-3.1-flash-image-preview"
  | "gemini-3-pro-image-preview"
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
  enabledTools?: ConversationToolName[];
  tokenCount?: number;
  status: NodeStatus;
  createdAt: string;
  isRoot: boolean;
  isPositionPinned: boolean;
  taskGoal?: string;
};

export type ConversationNodeData = ConversationNodeRecord & {
  isEditing?: boolean;
  isFocusMode?: boolean;
  isFocused?: boolean;
  isMultiDragging?: boolean;
  onAddAttachments?: (files: File[]) => void;
  onRemoveAttachment?: (attachmentId: string) => void;
  onAddUrlAttachment?: (url: string) => Promise<void>;
  onChangeModel?: (modelName: ConversationModelName) => void;
  onChangePromptMode?: (mode: ConversationPromptMode) => void;
  onToggleTool?: (tool: ConversationToolName) => void;
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
  onRegenerateCode?: () => void;
  onRegenerateResult?: () => void;
  onRegenerateImage?: () => void;
  onRunCode?: () => void;
  codeCollapsed?: boolean;
  onToggleCodeCollapse?: () => void;
};
