"use client";

import { memo, startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, MouseEvent as ReactMouseEvent } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  addEdge,
  reconnectEdge,
  type Edge,
  type OnReconnect,
  type FinalConnectionState,
  type Node,
  type NodeChange,
  type NodeTypes,
  type OnConnectStartParams,
  type Connection,
  type XYPosition,
  useEdgesState,
  useReactFlow,
  useViewport,
} from "@xyflow/react";
import {
  Clipboard,
  ClipboardCopy,
  FilePenLine,
  MessageCircleMore,
  MessageSquare,
  StickyNote,
  FileUp,
  Copy,
  Trash2,
  X,
  LayoutDashboard
} from "lucide-react";
import { ConversationNode } from "@/components/conversation-node";
import { useBrowserAuthReady } from "@/hooks/use-browser-auth-ready";
import { useUserSettings } from "@/hooks/use-user-settings";
import { Button } from "@/components/ui/button";
import { MagicImage } from "@/components/ui/magic-image";
import { buildLineageContext, type LineageEntry } from "@/lib/build-lineage-context";
import { authFetch } from "@/lib/auth-fetch";
import { getSuggestedChildPosition, layoutNodesForMindMap } from "@/lib/graph-layout";
import { getDefaultModelForPromptMode, isSupportedImageModelName, isSupportedTextModelName, normalizeModelName } from "@/lib/model-options";
import type {
  ConversationAttachment,
  ConversationImageModelName,
  ConversationModelName,
  ConversationNodeData,
  ConversationPromptMode,
  ConversationNodeRecord,
  ConversationToolName,
} from "@/lib/canvas-types";
import { getContentAwareNodeSize, getNodeDefaultSize } from "@/lib/node-layout";
import { CANVAS_COPY } from "@/lib/workspace-copy";
import { pyodideClient, type PyodideRunResult } from "@/lib/pyodide-client";
import { cn } from "@/lib/utils";

type PaneMenu = { kind: "pane"; flowPosition: XYPosition; top: number; left: number };
type NodeMenu = { kind: "node"; nodeId: string; top: number; left: number };
type PlacementOptions = { width: number; height: number };
type NodeHandlerSet = Pick<
  ConversationNodeData,
  | "onAddAttachments"
  | "onAddUrlAttachment"
  | "onRemoveAttachment"
  | "onChangeModel"
  | "onChangePromptMode"
  | "onToggleTool"
  | "onClearPromptMode"
  | "onUserContentChange"
  | "onResizeNode"
  | "onStartEdit"
  | "onStopEdit"
  | "onGenerateAiReply"
  | "onRegenerateAi"
  | "onRegenerateCode"
  | "onRegenerateResult"
  | "onRegenerateImage"
  | "onRunCode"
  | "onOpenDetail"
> & { isMultiDragging?: boolean };
type VisibleNodeCacheEntry = {
  sourceNode: Node<ConversationNodeRecord>;
  isEditing: boolean;
  isFocusMode: boolean;
  isFocused: boolean;
  canNavigateFocus: boolean;
  className?: string;
  node: Node<ConversationNodeData>;
};
type CanvasSnapshotCacheEntry = {
  nodes: Array<Node<ConversationNodeRecord>>;
  edges: Edge[];
  updatedAt: number;
};
type CanvasHistorySnapshot = {
  nodes: Array<Node<ConversationNodeRecord>>;
  edges: Edge[];
};
type PromptRequestContext = {
  lineage: LineageEntry[];
  inputNodeIds: string[];
};
type NodeActionRefs = {
  addNodeAttachments: (nodeId: string, files: File[]) => Promise<void>;
  addNodeUrlAttachment: (nodeId: string, url: string) => Promise<void>;
  removeNodeAttachment: (nodeId: string, attachmentId: string) => void;
  updateNodeModel: (nodeId: string, modelName: ConversationModelName) => void;
  updatePromptMode: (nodeId: string, promptMode: ConversationPromptMode) => void;
  toggleNodeTool: (nodeId: string, tool: ConversationToolName) => void;
  updateUserNodeContent: (nodeId: string, nextValue: string) => void;
  resizeNode: (nodeId: string, nextBounds: { width: number; height: number; x: number; y: number }) => void;
  setEditingNodeId: (nodeId: string | null) => void;
  runAiGenerationForUserNode: (parentNode: Node<ConversationNodeRecord>, preferredPosition?: XYPosition) => Promise<void>;
  runCodeGenerationForUserNode: (parentNode: Node<ConversationNodeRecord>, preferredPosition?: XYPosition) => Promise<void>;
  runImageGenerationForUserNode: (parentNode: Node<ConversationNodeRecord>) => Promise<void>;
  regenerateAiNode: (nodeId: string) => Promise<void>;
  regenerateCodeNode: (nodeId: string) => Promise<void>;
  regenerateImageNode: (nodeId: string) => Promise<void>;
  runCodeNode: (nodeId: string) => Promise<void>;
  focusNode: (nodeId: string, options?: { preserveViewport?: boolean }) => void;
};

const nodeTypes: NodeTypes = { conversation: ConversationNode };
const MIN_HORIZONTAL_GAP = 56;
const MIN_VERTICAL_GAP = 48;
const OVERLAP_GAP = 24;
const GEMINI_TEXT_MODEL_NAME: ConversationModelName = "gemini-3-flash-preview";
const GEMINI_IMAGE_MODEL_NAME: ConversationModelName = "gemini-3.1-flash-image-preview";
const PERSIST_CACHE_PREFIX = "canvas-cache-v1:";
const ACTIVE_CANVAS_KEY_PREFIX = "canvasai.active-canvas";
const NEW_CANVAS_KEY_PREFIX = "canvasai.new-canvas";
const DEFAULT_PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID ?? "canvasai-mvp";
const FILE_NODE_UPLOAD_ERROR = CANVAS_COPY.fileUploadFailed;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

const timestampLabel = () =>
  new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

const TEXT_SELECTION_BLOCKER_SELECTOR = [
  "textarea",
  "input",
  "[contenteditable='true']",
  ".mindmap-markdown",
  ".mindmap-node-shell__body",
].join(", ");

function getNewCanvasKey(userId?: string) {
  return `${NEW_CANVAS_KEY_PREFIX}.${userId ?? "anonymous"}`;
}

function consumeFreshCanvasFlag(projectId: string, userId?: string) {
  try {
    const key = getNewCanvasKey(userId);
    const raw = window.sessionStorage.getItem(key);
    if (!raw) {
      return false;
    }

    const pendingIds = JSON.parse(raw) as string[];
    if (!Array.isArray(pendingIds) || !pendingIds.includes(projectId)) {
      return false;
    }

    const nextIds = pendingIds.filter((id) => id !== projectId);
    if (nextIds.length === 0) {
      window.sessionStorage.removeItem(key);
    } else {
      window.sessionStorage.setItem(key, JSON.stringify(nextIds));
    }

    return true;
  } catch {
    return false;
  }
}

const revokeAttachmentPreviewUrls = (attachments: ConversationAttachment[]) => {
  attachments.forEach((attachment) => {
    if (attachment.previewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
  });
};

const sanitizeAttachmentsForPersistence = (attachments: ConversationAttachment[]): ConversationAttachment[] =>
  attachments.map(({ previewUrl, ...attachment }) => {
    void previewUrl;
    return attachment;
  });

const sanitizeNodesForPersistence = (nodes: Array<Node<ConversationNodeRecord>>) =>
  nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      attachments: sanitizeAttachmentsForPersistence(node.data.attachments),
    },
  }));

const normalizeSnapshot = (snapshot: {
  nodes?: Array<Node<ConversationNodeRecord>>;
  edges?: Edge[];
}): CanvasSnapshotCacheEntry => ({
  nodes: sanitizeNodesForPersistence(snapshot.nodes || []).map((node) => normalizeNode({ ...node, selected: false })),
  edges: (snapshot.edges || []).map(normalizeEdge),
  updatedAt: Date.now(),
});

const mergeSnapshotNodeSizes = (
  snapshot: CanvasSnapshotCacheEntry,
  cachedSnapshot?: CanvasSnapshotCacheEntry | null,
): CanvasSnapshotCacheEntry => {
  if (!cachedSnapshot) {
    return snapshot;
  }

  const cachedNodeMap = new Map(cachedSnapshot.nodes.map((node) => [node.id, node]));

  return {
    ...snapshot,
    nodes: snapshot.nodes.map((node) => {
      const cachedNode = cachedNodeMap.get(node.id);
      const cachedWidth = Number(cachedNode?.style?.width);
      const cachedHeight = Number(cachedNode?.style?.height);

      if (!Number.isFinite(cachedWidth) || !Number.isFinite(cachedHeight)) {
        return node;
      }

      return {
        ...node,
        style: {
          ...node.style,
          width: cachedWidth,
          height: cachedHeight,
        },
      };
    }),
  };
};

const getActiveImageModel = (name: string | undefined): ConversationImageModelName => {
  const normalized = normalizeModelName(name, "image-create");
  if (isSupportedImageModelName(normalized)) return normalized;
  return GEMINI_IMAGE_MODEL_NAME;
};

async function requestGeminiText(requestPayload: {
  targetNodeId: string;
  lineage: LineageEntry[];
  model: { provider: "gemini"; name: string };
  projectId?: string;
  promptMode?: ConversationPromptMode;
  enabledTools?: ConversationToolName[];
  onTextDelta?: (text: string) => void;
}): Promise<{ ok: true; model: string; text: string; tokenCount?: number | null; webSearchUsed?: boolean | null }> {
  const consumeSseEvents = (source: string) => {
    const events = source.split(/\r?\n\r?\n/);
    const remainder = events.pop() ?? "";
    return { events, remainder };
  };

  try {
    const response = await authFetch("/api/gemini/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetNodeId: requestPayload.targetNodeId,
        lineage: requestPayload.lineage,
        model: requestPayload.model,
        projectId: requestPayload.projectId,
        promptMode: requestPayload.promptMode,
        enabledTools: requestPayload.enabledTools,
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new Error(payload?.error?.message ?? CANVAS_COPY.geminiRequestFailed);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let fullText = "";
    let result: { ok: true; model: string; text: string; tokenCount?: number | null; webSearchUsed?: boolean | null } | null = null;

  const flushEvent = (rawEvent: string) => {
    const dataLines = rawEvent
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);

    if (dataLines.length === 0) {
      return;
    }

    const payload = JSON.parse(dataLines.join("\n")) as
      | { type: "start"; model: string }
      | { type: "text-delta"; text: string }
      | { type: "done"; model: string; text: string; tokenCount?: number | null; webSearchUsed?: boolean | null }
      | { type: "error"; message: string };

    if (payload.type === "text-delta") {
      fullText += payload.text;
      requestPayload.onTextDelta?.(fullText);
      return;
    }

    if (payload.type === "done") {
      result = {
        ok: true,
        model: payload.model,
        text: payload.text,
        tokenCount: payload.tokenCount ?? null,
        webSearchUsed: payload.webSearchUsed ?? null,
      };
      return;
    }

    if (payload.type === "error") {
      throw new Error(payload.message);
    }
  };

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

    if (!result) {
      throw new Error(CANVAS_COPY.geminiStreamFailed);
    }

    return result;
  } finally {
    window.dispatchEvent(new CustomEvent("credits:refresh"));
  }
}

async function requestGeminiImage(requestPayload: {
  prompt: string;
  attachments: ConversationAttachment[];
  lineage: LineageEntry[];
  modelName: ConversationImageModelName;
  projectId?: string;
}): Promise<{ ok: true; model: string; attachments: ConversationAttachment[]; tokenCount?: number | null }> {
  try {
    const response = await authFetch("/api/gemini/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestPayload),
    });
    const payload = (await response.json()) as
      | { ok: true; model: string; attachments: ConversationAttachment[]; tokenCount?: number | null }
      | { ok: false; error?: { message?: string } };

    if (!response.ok || !payload.ok) {
      throw new Error(payload.ok ? CANVAS_COPY.imageRequestFailed : payload.error?.message ?? CANVAS_COPY.imageRequestFailed);
    }

    return payload;
  } finally {
    window.dispatchEvent(new CustomEvent("credits:refresh"));
  }
}

function shouldPreserveNativeContextMenu(event: MouseEvent | ReactMouseEvent<Element, MouseEvent>) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.closest(TEXT_SELECTION_BLOCKER_SELECTOR)) {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) {
      return true;
    }

    if (target.closest("textarea, input, [contenteditable='true']")) {
      return true;
    }
  }

  return false;
}

function base64ToFile(params: { bytesBase64: string; fileName: string; mimeType: string }) {
  const binary = atob(params.bytesBase64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new File([bytes], params.fileName, { type: params.mimeType });
}

function buildPyodideContextText(lineage: LineageEntry[]) {
  if (lineage.length === 0) {
    return "";
  }

  return lineage
    .map((entry) => {
      const heading =
        entry.kind === "user"
          ? "Prompt"
          : entry.kind === "note"
            ? "Note"
            : entry.kind === "ai"
              ? "AI Response"
              : entry.kind === "file"
                ? "File"
                : entry.kind === "image"
                  ? "Image"
                  : entry.kind === "result"
                    ? "Execution Result"
                    : "Code";

      const attachmentLines = entry.attachments.map((attachment) => `- ${attachment.kind}: ${attachment.name} (${attachment.url})`);
      return [
        `## ${heading}`,
        entry.content.trim() || "_No text_",
        attachmentLines.length > 0 ? "### Attachments" : "",
        ...attachmentLines,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

function buildCodeNodeContent(params: {
  code: string;
  taskGoal?: string;
  packages: string[];
  stagedInputs: Array<{ name: string; path: string | null; kind: ConversationAttachment["kind"]; url: string }>;
}) {
  const packageSection =
    params.packages.length > 0
      ? `## Packages\n${params.packages.map((pkg) => `- \`${pkg}\``).join("\n")}`
      : "## Packages\n- _No external packages detected_";
  const inputSection =
    params.stagedInputs.length > 0
      ? `## Inputs\n${params.stagedInputs
        .map((input) => `- \`${input.name}\` -> \`${input.path || "N/A"}\``)
        .join("\n")}\n\n> Files are stored in \`/workspace/inputs/\` directory`
      : "## Inputs\n- _No staged inputs_\n\n> Add files to this node to use them in Python code";

  return [
    "## Python",
    "```python",
    params.code || "# Empty code",
    "```",
    packageSection,
    inputSection,
  ].join("\n\n");
}

function buildResultNodeContent(params: PyodideRunResult) {
  const statusEmoji = params.success ? "✅" : "❌";
  const statusLabel = params.success ? "Success" : "Failed";
  
  const fileSection = params.files.length > 0
    ? `## Generated Files\n\n${params.files.map((file) => `- **${file.name}**`).join("\n")}`
    : "";

  const stdoutSection = params.stdout
    ? `### Standard Output\n\n\`\`\`text\n${params.stdout}\n\`\`\``
    : "";

  const errorSection = params.errorMessage
    ? `### Error\n\n\`\`\`text\n${params.errorMessage}\n\`\`\``
    : "";

  const packageSection = params.detectedPackages.length > 0
    ? `### Packages Used\n\n${params.detectedPackages.map((pkg) => `\`${pkg}\``).join(", ")}`
    : "";

  const stderrSection = params.stderr
    ? `### Standard Error\n\n\`\`\`text\n${params.stderr}\n\`\`\``
    : "";

  return [
    `## Execution ${statusEmoji} ${statusLabel}`,
    fileSection,
    "",
    "<details>",
    "<summary><strong>Show Details</strong></summary>",
    "",
    stdoutSection,
    errorSection,
    packageSection,
    stderrSection,
    "</details>",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function extractPythonCode(text: string) {
  const fenced = text.match(/```(?:python|py)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  return text.trim();
}

function buildCodeGenerationLineage(lineage: LineageEntry[]) {
  const nextLineage = lineage.map((entry) => ({ ...entry, attachments: entry.attachments ? [...entry.attachments] : [] }));
  const latestUserIndex = [...nextLineage].reverse().findIndex((entry) => entry.kind === "user");
  if (latestUserIndex === -1) {
    return nextLineage;
  }

  const targetIndex = nextLineage.length - 1 - latestUserIndex;
  const originalPrompt = nextLineage[targetIndex].content.trim();
  const inputAttachments = nextLineage[targetIndex].attachments ?? [];
  const hasInputFiles = inputAttachments.length > 0;
  
  const fileInstructions = hasInputFiles
    ? [
        "",
        "## Input Files",
        `You have ${inputAttachments.length} input file(s) available:`,
        inputAttachments.map((att) => `- ${att.name} (${att.kind})`).join("\n"),
        "IMPORTANT: Read input files from `/workspace/inputs/` directory.",
        "Check `/workspace/input_manifest.json` for file metadata.",
        "Process these files as needed to fulfill the user's request.",
        "For CSV/JSON: use pandas or json to read and process.",
        "For images: use PIL or matplotlib to read and process.",
        "Save output files to `/workspace/artifacts/` directory.",
      ].join("\n")
    : "";

  nextLineage[targetIndex] = {
    ...nextLineage[targetIndex],
    content: [
      "Write Python code that solves the user's request.",
      "This code will run in Pyodide in the browser, not in a full local CPython environment.",
      "Return only executable Python code.",
      "Do not include markdown fences, explanations, comments outside the code, or prose.",
      "Put every required import at the top of the file before using the module.",
      "Prefer Python standard library first.",
      "Only use packages that are commonly available in Pyodide when they are truly necessary.",
      "Minimize dependencies. Do not import scipy, pandas, sklearn, or any other heavy package unless the task genuinely requires it.",
      "If the task can be solved with plain Python, math, statistics, json, csv, or re, use those instead.",
      "If plotting is useful, use matplotlib with plt.show().",
      "When using matplotlib for charts/graphs:",
      "  - Always set figure size: plt.figure(figsize=(10, 6), dpi=100)",
      "  - Use plt.tight_layout() before plt.show() to prevent clipping",
      "  - For saving: plt.savefig('output.png', bbox_inches='tight', dpi=150)",
      fileInstructions,
      "If the user asks for a simple calculation, write the shortest correct Python needed and print the answer clearly.",
      "",
      `User request: ${originalPrompt}`,
    ].join("\n"),
  };

  return nextLineage;
}

async function uploadFiles(files: File[], projectId?: string) {
  const uploaded = [];
  for (const file of files) {
    const formData = new FormData();
    formData.append("file", file);
    if (projectId) {
      formData.append("projectId", projectId);
    }
    const response = await authFetch("/api/attachments/file", { method: "POST", body: formData });
    const payload = (await response.json()) as
      | { ok: true; attachment: ConversationNodeRecord["attachments"][number] }
      | { ok: false; error?: { message?: string } };
    if (!response.ok || !payload.ok) {
      throw new Error(payload.ok ? CANVAS_COPY.attachmentUploadFailed : payload.error?.message ?? CANVAS_COPY.attachmentUploadFailed);
    }
    uploaded.push(payload.attachment);
  }
  return uploaded;
}

async function uploadSingleFile(file: File, projectId?: string) {
  const uploaded = await uploadFiles([file], projectId);
  return uploaded[0];
}

async function executePyodideCode(params: {
  code: string;
  attachments: ConversationAttachment[];
  contextText: string;
  projectId?: string;
}) {
  await pyodideClient.ensureReady().catch((error) => {
    throw new Error(error instanceof Error ? error.message : CANVAS_COPY.pyodideInitFailed);
  });

  const result = await pyodideClient.runCode({
    code: params.code,
    attachments: params.attachments,
    contextText: params.contextText,
  }).catch((error) => {
    throw new Error(error instanceof Error ? error.message : CANVAS_COPY.pyodideRunFailed);
  });

  const uploadedArtifacts =
    result.files.length > 0
      ? await uploadFiles(
        result.files.map((file) =>
          base64ToFile({
            bytesBase64: file.bytesBase64,
            fileName: file.name,
            mimeType: file.mimeType,
          })),
        params.projectId,
      )
      : [];

  return { ...result, attachments: uploadedArtifacts };
}

const getNodeSize = (kind: ConversationNodeRecord["kind"]): PlacementOptions => {
  return getNodeDefaultSize(kind);
};

const getAllowedAttachmentKindsForPromptMode = (promptMode: ConversationPromptMode): ReadonlySet<ConversationAttachment["kind"]> => {
  if (promptMode === "image-create") {
    return new Set(["image"]);
  }

  if (promptMode === "code") {
    return new Set(["image", "pdf", "url", "file"]);
  }

  return new Set(["image", "pdf", "url"]);
};

const filterAttachmentsForPromptMode = (
  attachments: ConversationAttachment[],
  promptMode: ConversationPromptMode,
) => {
  const allowedKinds = getAllowedAttachmentKindsForPromptMode(promptMode);
  return attachments.filter((attachment) => allowedKinds.has(attachment.kind));
};

const getSupportedToolsForPromptMode = (promptMode: ConversationPromptMode): ConversationToolName[] => {
  if (promptMode === "image-create") {
    return [];
  }

  if (promptMode === "code") {
    return [];
  }

  return ["google-search", "url-context"];
};

const sanitizeEnabledToolsForPromptMode = (
  enabledTools: ConversationToolName[] | undefined,
  promptMode: ConversationPromptMode,
) => {
  const supportedTools = new Set(getSupportedToolsForPromptMode(promptMode));
  return Array.from(new Set((enabledTools ?? []).filter((tool) => supportedTools.has(tool))));
};

const shouldIncludeNodeAsPromptInput = (
  node: Node<ConversationNodeRecord>,
  promptMode: ConversationPromptMode,
) => {
  const filteredAttachments = filterAttachmentsForPromptMode(node.data.attachments, promptMode);
  const hasSupportedAttachments = filteredAttachments.length > 0;
  const hasMeaningfulText = node.data.content.trim().length > 0;

  if (node.data.kind === "file" || node.data.kind === "image") {
    return hasSupportedAttachments;
  }

  return hasSupportedAttachments || hasMeaningfulText;
};

const getNodeSizeForRecord = (record: ConversationNodeRecord): PlacementOptions => getNodeDefaultSize(record.kind);

const buildNode = (id: string, position: XYPosition, record: ConversationNodeRecord): Node<ConversationNodeRecord> => {
  const size = getNodeSizeForRecord(record);
  return {
    id,
    type: "conversation",
    position,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: record,
    draggable: true,
    selectable: true,
    dragHandle: ".node-drag-handle",
    style: { width: size.width, height: size.height },
  };
};

const buildEdge = (source: string, target: string): Edge => ({
  id: `${source}->${target}`,
  source,
  target,
  type: "simplebezier",
  className: "mindmap-edge",
  selectable: true,
  focusable: true,
  reconnectable: false,
  animated: false,
  style: { stroke: "#9d9d9d", strokeWidth: 3.2, opacity: 1 },
});

const normalizeNode = (node: Node<ConversationNodeRecord>) => {
  const size = getNodeSizeForRecord(node.data);
  return {
    ...node,
    dragHandle: ".node-drag-handle",
    style: {
      width: Number(node.style?.width ?? size.width),
      height: Number(node.style?.height ?? size.height),
    },
  };
};

const normalizeEdge = (edge: Edge): Edge => ({ ...buildEdge(edge.source, edge.target), id: edge.id });

const getNodeRect = (position: XYPosition, size: PlacementOptions) => ({
  left: position.x,
  top: position.y,
  right: position.x + size.width,
  bottom: position.y + size.height,
});

const overlaps = (a: ReturnType<typeof getNodeRect>, b: ReturnType<typeof getNodeRect>) =>
  !(a.right + OVERLAP_GAP <= b.left || a.left >= b.right + OVERLAP_GAP || a.bottom + OVERLAP_GAP <= b.top || a.top >= b.bottom + OVERLAP_GAP);

function findAvailablePosition(desired: XYPosition, size: PlacementOptions, nodes: Array<Node<ConversationNodeRecord>>) {
  const xOffsets = [0, 84, 168, 252, 336, 420, 504, -84, -168, -252, -336, -420, -504];
  const yOffsets = [0, MIN_VERTICAL_GAP, MIN_VERTICAL_GAP * 2, MIN_VERTICAL_GAP * 3, MIN_VERTICAL_GAP * 4, -MIN_VERTICAL_GAP, -MIN_VERTICAL_GAP * 2, -MIN_VERTICAL_GAP * 3];
  const candidates = xOffsets.flatMap((xOffset) =>
    yOffsets.map((yOffset) => ({
      x: desired.x + xOffset,
      y: desired.y + yOffset,
      score: Math.abs(xOffset) + Math.abs(yOffset),
    })),
  )
    .sort((left, right) => left.score - right.score);

  for (const candidatePosition of candidates) {
    const candidate = { x: candidatePosition.x, y: candidatePosition.y };
    const candidateRect = getNodeRect(candidate, size);
    const hasOverlap = nodes.some((node) =>
      overlaps(
        candidateRect,
        getNodeRect(node.position, {
          width: Number(node.style?.width ?? getNodeSize(node.data.kind).width),
          height: Number(node.style?.height ?? getNodeSize(node.data.kind).height),
        }),
      ),
    );
    if (!hasOverlap) return candidate;
  }
  return desired;
}

const toWrapperPosition = (clientX: number, clientY: number, wrapper: HTMLDivElement) => {
  const rect = wrapper.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
};

function FlowCanvasInner({ userId, initialProjectId }: { userId?: string; initialProjectId?: string }) {
  const stableNodeTypes = useMemo(() => nodeTypes, []);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const paneFileInputRef = useRef<HTMLInputElement | null>(null);
  const [nodes, setNodes] = useState<Array<Node<ConversationNodeRecord>>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [menu, setMenu] = useState<PaneMenu | NodeMenu | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [isHydratingCanvas, setIsHydratingCanvas] = useState(true);
  const [isFreshCanvas, setIsFreshCanvas] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [isRangeSelectionPressed, setIsRangeSelectionPressed] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState(initialProjectId ?? DEFAULT_PROJECT_ID);
  const { settings } = useUserSettings(userId ?? null);
  const isBrowserAuthReady = useBrowserAuthReady();
  const reactFlow = useReactFlow<Node<ConversationNodeData>, Edge>();
  const viewport = useViewport();
  const hasHydratedCanvasRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectSourceNodeIdRef = useRef<string | null>(null);
  const pendingPaneUploadPositionRef = useRef<XYPosition | null>(null);
  const nodesRef = useRef<Array<Node<ConversationNodeRecord>>>([]);
  const edgesRef = useRef<Edge[]>([]);
  const deletedNodeIdsRef = useRef<Set<string>>(new Set());
  const focusedNodeIdRef = useRef<string | null>(null);
  const focusRestoreViewportRef = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const streamedTextRef = useRef<Record<string, { text: string; runId: string }>>({});
  const streamedTextFrameRef = useRef<number | null>(null);
  const nodeHandlerCacheRef = useRef<Map<string, NodeHandlerSet>>(new Map());
  const visibleNodeCacheRef = useRef<Map<string, VisibleNodeCacheEntry>>(new Map());
  const projectSnapshotCacheRef = useRef<Map<string, CanvasSnapshotCacheEntry>>(new Map());
  const mousePositionRef = useRef<XYPosition>({ x: 0, y: 0 });
  const historyPastRef = useRef<CanvasHistorySnapshot[]>([]);
  const historyFutureRef = useRef<CanvasHistorySnapshot[]>([]);
  const lastHistorySnapshotRef = useRef<CanvasHistorySnapshot | null>(null);
  const suppressHistoryRef = useRef(false);
  const activeGenerationRunsRef = useRef<Map<string, string>>(new Map());
  const activeGenerationEdgeIdsRef = useRef<Set<string>>(new Set());
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [isMultiDragging, setIsMultiDragging] = useState(false);
  const [activeGenerationEdgeIds, setActiveGenerationEdgeIds] = useState<string[]>([]);
  const nodeActionRefs = useRef<NodeActionRefs | null>(null);
  const defaultUserModel = getDefaultModelForPromptMode("auto", settings);

  const getProjectCacheKey = useCallback(
    (projectId: string) => `${PERSIST_CACHE_PREFIX}${userId ? `${userId}.` : ""}${projectId}`,
    [userId],
  );

  const applySnapshotToCanvas = useCallback((snapshot: CanvasSnapshotCacheEntry) => {
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
  }, [setEdges]);

  const cloneHistorySnapshot = useCallback(
    (snapshot: CanvasHistorySnapshot): CanvasHistorySnapshot => structuredClone(snapshot),
    [],
  );

  const serializeHistorySnapshot = useCallback(
    (snapshot: CanvasHistorySnapshot) =>
      JSON.stringify({
        nodes: sanitizeNodesForPersistence(snapshot.nodes),
        edges: snapshot.edges,
      }),
    [],
  );

  const captureHistorySnapshot = useCallback(
    () => ({
      nodes: structuredClone(nodesRef.current),
      edges: structuredClone(edgesRef.current),
    }),
    [],
  );

  const beginGenerationRun = useCallback((nodeId: string) => {
    const runId = crypto.randomUUID();
    activeGenerationRunsRef.current.set(nodeId, runId);
    return runId;
  }, []);

  const clearGenerationRun = useCallback((nodeId: string, runId?: string) => {
    const activeRunId = activeGenerationRunsRef.current.get(nodeId);
    if (!activeRunId) {
      return;
    }

    if (runId && activeRunId !== runId) {
      return;
    }

    activeGenerationRunsRef.current.delete(nodeId);
    delete streamedTextRef.current[nodeId];
  }, []);

  const setActiveGenerationEdges = useCallback((edgeIds: Iterable<string>) => {
    const nextIds = Array.from(new Set(edgeIds));
    activeGenerationEdgeIdsRef.current = new Set(nextIds);
    setActiveGenerationEdgeIds(nextIds);
  }, []);

  const clearActiveGenerationEdges = useCallback((edgeIds?: Iterable<string>) => {
    if (!edgeIds) {
      activeGenerationEdgeIdsRef.current.clear();
      setActiveGenerationEdgeIds([]);
      return;
    }

    const nextSet = new Set(activeGenerationEdgeIdsRef.current);
    for (const edgeId of edgeIds) {
      nextSet.delete(edgeId);
    }
    activeGenerationEdgeIdsRef.current = nextSet;
    setActiveGenerationEdgeIds(Array.from(nextSet));
  }, []);

  const applyHistorySnapshot = useCallback(
    (snapshot: CanvasHistorySnapshot) => {
      suppressHistoryRef.current = true;
      setNodes(cloneHistorySnapshot(snapshot).nodes);
      setEdges(cloneHistorySnapshot(snapshot).edges);
      setMenu(null);
      setEditingNodeId(null);
    },
    [cloneHistorySnapshot, setEdges],
  );

  const storeSnapshotInCaches = useCallback(
    (projectId: string, snapshot: CanvasSnapshotCacheEntry) => {
      projectSnapshotCacheRef.current.set(projectId, snapshot);
      localStorage.setItem(
        getProjectCacheKey(projectId),
        JSON.stringify({
          nodes: sanitizeNodesForPersistence(snapshot.nodes),
          edges: snapshot.edges,
          updatedAt: snapshot.updatedAt,
        }),
      );
    },
    [getProjectCacheKey],
  );

  useEffect(() => {
    if (!isBrowserAuthReady) {
      return;
    }

    if (!userId || initialProjectId || typeof window === "undefined") {
      return;
    }

    try {
      const storedProjectId = window.localStorage.getItem(`${ACTIVE_CANVAS_KEY_PREFIX}.${userId}`)?.trim();
      if (storedProjectId) {
        setCurrentProjectId(storedProjectId);
      }
    } catch (error) {
      console.warn("Failed to read active canvas id", error);
    }
  }, [initialProjectId, isBrowserAuthReady, userId]);

  useEffect(() => {
    if (!initialProjectId) {
      return;
    }

    setCurrentProjectId((prev) => {
      if (prev === initialProjectId) {
        return prev;
      }
      hasHydratedCanvasRef.current = false;
      return initialProjectId;
    });
  }, [initialProjectId]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    const currentSnapshot = {
      nodes: structuredClone(nodes),
      edges: structuredClone(edges),
    };

    if (suppressHistoryRef.current) {
      lastHistorySnapshotRef.current = currentSnapshot;
      suppressHistoryRef.current = false;
      return;
    }

    if (isHydratingCanvas) {
      lastHistorySnapshotRef.current = currentSnapshot;
      return;
    }

    const previousSnapshot = lastHistorySnapshotRef.current;
    if (!previousSnapshot) {
      lastHistorySnapshotRef.current = currentSnapshot;
      return;
    }

    if (serializeHistorySnapshot(previousSnapshot) === serializeHistorySnapshot(currentSnapshot)) {
      return;
    }

    historyPastRef.current.push(cloneHistorySnapshot(previousSnapshot));
    if (historyPastRef.current.length > 100) {
      historyPastRef.current.shift();
    }
    historyFutureRef.current = [];
    lastHistorySnapshotRef.current = currentSnapshot;
  }, [cloneHistorySnapshot, edges, isHydratingCanvas, nodes, serializeHistorySnapshot]);

  useEffect(() => {
    focusedNodeIdRef.current = focusedNodeId;
  }, [focusedNodeId]);

  useEffect(() => {
    historyPastRef.current = [];
    historyFutureRef.current = [];
    lastHistorySnapshotRef.current = null;
    suppressHistoryRef.current = false;
    activeGenerationRunsRef.current.clear();
    streamedTextRef.current = {};
    activeGenerationEdgeIdsRef.current.clear();
    setActiveGenerationEdgeIds([]);
  }, [currentProjectId]);

  useEffect(() => () => {
    if (streamedTextFrameRef.current !== null) {
      cancelAnimationFrame(streamedTextFrameRef.current);
    }
  }, []);

  const clipboardRef = useRef<{
    nodes: Array<Node<ConversationNodeRecord>>;
    edges: Edge[];
  } | null>(null);

  const copySelected = useCallback(() => {
    const selectedNodes = nodes.filter((n) => n.selected);
    if (selectedNodes.length === 0) return;

    // Filter edges that connect selected nodes
    const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));
    const selectedEdges = edges.filter(
      (e) => (e.selected || (selectedNodeIds.has(e.source) && selectedNodeIds.has(e.target)))
    );

    clipboardRef.current = {
      nodes: JSON.parse(JSON.stringify(selectedNodes)),
      edges: JSON.parse(JSON.stringify(selectedEdges)),
    };
  }, [nodes, edges]);

  const cutSelected = useCallback(() => {
    copySelected();
    const selectedNodeIds = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
    if (selectedNodeIds.size === 0) return;

    setNodes((current) => current.filter((n) => !selectedNodeIds.has(n.id)));
    setEdges((current) => current.filter((e) => !selectedNodeIds.has(e.source) && !selectedNodeIds.has(e.target)));
  }, [copySelected, nodes, setEdges]);

  const paste = useCallback(() => {
    if (!clipboardRef.current || clipboardRef.current.nodes.length === 0) return;

    const { nodes: clipboardNodes, edges: clipboardEdges } = clipboardRef.current;
    const idMap = new Map<string, string>();

    // Calculate bounding box of copied nodes to paste them relative to mouse
    let minX = Infinity;
    let minY = Infinity;
    clipboardNodes.forEach((node) => {
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
    });

    const mousePos = mousePositionRef.current;

    // Generate new IDs and position relative to mouse
    const newNodes = clipboardNodes.map((node) => {
      const newId = crypto.randomUUID();
      idMap.set(node.id, newId);
      
      const offsetX = node.position.x - minX;
      const offsetY = node.position.y - minY;
      
      return {
        ...node,
        id: newId,
        selected: true,
        position: {
          x: mousePos.x + offsetX,
          y: mousePos.y + offsetY,
        },
        data: {
          ...node.data,
          // Update parentId if its parent is also being pasted, otherwise reset to null
          // to keep the pasted bundle independent and avoid broken references.
          parentId: (node.data.parentId && idMap.has(node.data.parentId)) ? (idMap.get(node.data.parentId) ?? null) : null,
        }
      };
    });

    // Fix parentId for nodes whose parent was processed later in the map list
    newNodes.forEach(node => {
      const originalParentId = clipboardNodes.find(cn => cn.id === idMap.get(node.id))?.data.parentId;
      if (originalParentId && idMap.has(originalParentId)) {
        node.data.parentId = idMap.get(originalParentId)!;
      }
    });

    const newEdges = clipboardEdges
      .filter(edge => idMap.has(edge.source) && idMap.has(edge.target))
      .map((edge) => ({
        ...edge,
        id: crypto.randomUUID(),
        source: idMap.get(edge.source)!,
        target: idMap.get(edge.target)!,
        selected: true,
      }));

    setNodes((current) => [
      ...current.map((n) => ({ ...n, selected: false })),
      ...newNodes,
    ]);
    setEdges((current) => [
      ...current.map((e) => ({ ...e, selected: false })),
      ...newEdges,
    ]);
  }, [setNodes, setEdges]);

  const scheduleStreamedNodeContentUpdate = useCallback((nodeId: string, text: string, runId: string) => {
    if (activeGenerationRunsRef.current.get(nodeId) !== runId) {
      return;
    }

    streamedTextRef.current[nodeId] = { text, runId };

    if (streamedTextFrameRef.current !== null) {
      return;
    }

    streamedTextFrameRef.current = requestAnimationFrame(() => {
      streamedTextFrameRef.current = null;
      const pendingUpdates = new Map(Object.entries(streamedTextRef.current));
      streamedTextRef.current = {};

      if (pendingUpdates.size === 0) {
        return;
      }

      startTransition(() => {
        setNodes((latest) =>
          latest.map((node) => {
            const pendingUpdate = pendingUpdates.get(node.id);
            if (!pendingUpdate) {
              return node;
            }

            if (activeGenerationRunsRef.current.get(node.id) !== pendingUpdate.runId) {
              return node;
            }

            return {
              ...node,
              style:
                node.data.kind === "ai"
                  ? {
                    ...node.style,
                    ...getContentAwareNodeSize("ai", pendingUpdate.text),
                  }
                  : node.style,
              data: {
                ...node.data,
                content: pendingUpdate.text,
                status: "generating",
              },
            };
          }),
        );
      });
    });
  }, []);

  const markDeepResearchUnavailable = useCallback((nodeId: string) => {
    setNodes((current) =>
      current.map((entry) =>
        entry.id === nodeId
          ? {
            ...entry,
            data: {
              ...entry.data,
              status: "error",
              content: `${entry.data.content}\n\n${CANVAS_COPY.deepResearchUnavailable}`,
            },
          }
          : entry,
      ),
    );
  }, []);

  const onNodesChange = useCallback((changes: NodeChange<Node<ConversationNodeRecord>>[]) => {
    setNodes((current) => applyNodeChanges(changes, current) as Array<Node<ConversationNodeRecord>>);
  }, []);

  const updateUserNodeContent = useCallback((nodeId: string, nextValue: string) => {
    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId && (node.data.kind === "user" || node.data.kind === "note")
          ? { ...node, data: { ...node.data, content: nextValue } }
          : node,
      ),
    );
  }, []);

  const updateNodeModel = useCallback((nodeId: string, modelName: ConversationModelName) => {
    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId
          ? {
            ...node,
            data: {
              ...node.data,
              modelConfig: { provider: "gemini", name: modelName },
            },
          }
          : node,
      ),
    );
  }, []);

  const convertNodeKind = useCallback((nodeId: string, nextKind: "user" | "note") => {
    setNodes((current) =>
      current.map((node) => {
        if (node.id !== nodeId) return node;
        if (node.data.kind !== "user" && node.data.kind !== "note") return node;
        if (node.data.kind === nextKind) return node;

        return {
          ...node,
          style: {
            ...node.style,
            ...getContentAwareNodeSize(nextKind, node.data.content),
          },
          data: {
            ...node.data,
            kind: nextKind,
            modelConfig: nextKind === "user" ? { provider: "gemini", name: defaultUserModel } : undefined,
            promptMode: nextKind === "user" ? "auto" : undefined,
            enabledTools: nextKind === "user" ? [] : undefined,
          },
        };
      }),
    );
  }, [defaultUserModel]);

  const buildOptimisticAttachment = useCallback((file: File): ConversationAttachment => ({
    id: `temp-${crypto.randomUUID()}`,
    kind: file.type.startsWith("image/") ? "image" : "pdf",
    name: file.name,
    url: "",
    previewUrl: URL.createObjectURL(file),
    createdAt: new Date().toISOString(),
  }), []);

  const addNodeAttachments = useCallback(async (nodeId: string, files: File[]) => {
    if (files.length === 0) return;

    // Add optimistic previews
    const optimistic = files.map(buildOptimisticAttachment);
    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, attachments: [...node.data.attachments, ...optimistic] } } : node,
      ),
    );

    try {
      const attachments = await uploadFiles(files, currentProjectId);
      revokeAttachmentPreviewUrls(optimistic);
      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId ? {
            ...node,
            data: {
              ...node.data,
              attachments: [...node.data.attachments.filter(a => !a.id.startsWith("temp-")), ...attachments]
            }
          } : node,
        ),
      );
    } catch (err) {
      console.error("Failed to upload files", err);
      revokeAttachmentPreviewUrls(optimistic);
      // Remove optimistic ghosts on failure
      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId ? {
            ...node,
            data: {
              ...node.data,
              attachments: node.data.attachments.filter(a => !a.id.startsWith("temp-"))
            }
          } : node,
        ),
      );
    }
  }, [currentProjectId, buildOptimisticAttachment]);

  const addNodeUrlAttachment = useCallback(async (nodeId: string, url: string) => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    const response = await authFetch("/api/attachments/url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: trimmedUrl,
        projectId: currentProjectId,
      }),
    });
    const payload = (await response.json()) as
      | { ok: true; attachment: ConversationAttachment }
      | { ok: false; error?: { message?: string } };

    if (!response.ok || !payload.ok) {
      throw new Error(payload.ok ? "Failed to attach URL." : payload.error?.message ?? "Failed to attach URL.");
    }

    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId
          ? {
            ...node,
            data: {
              ...node.data,
              attachments: [...node.data.attachments, payload.attachment],
            },
          }
          : node,
      ),
    );
  }, [currentProjectId]);

  const createFileNodesFromFiles = useCallback(
    async (files: File[], origin: XYPosition) => {
      if (files.length === 0) return;

      const pendingFiles = files.map((file, index) => ({
        file,
        nodeId: crypto.randomUUID(),
        desired: {
          x: origin.x + index * 28,
          y: origin.y + index * 28,
        },
      }));

      setNodes((current) => {
        const nextNodes = [...current.map((node) => ({ ...node, selected: false }))];

        for (const pendingFile of pendingFiles) {
          const kind = "file";
          const record: ConversationNodeRecord = {
            parentId: null,
            kind,
            content: pendingFile.file.name,
            attachments: [buildOptimisticAttachment(pendingFile.file)],
            status: "generating",
            createdAt: timestampLabel(),
            isRoot: true,
            isPositionPinned: false,
          };
          const position = findAvailablePosition(pendingFile.desired, getNodeDefaultSize(kind), nextNodes);
          nextNodes.push({
            ...buildNode(pendingFile.nodeId, position, record),
            selected: true,
          });
        }

        return nextNodes;
      });

      for (const pendingFile of pendingFiles) {
        try {
          const attachment = await uploadSingleFile(pendingFile.file, currentProjectId);
          setNodes((current) =>
            current.map((node) =>
              node.id === pendingFile.nodeId
                ? {
                  ...node,
                  data: {
                    ...node.data,
                    attachments: [attachment],
                    status: "idle",
                  },
                }
                : node,
            ),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : FILE_NODE_UPLOAD_ERROR;
          setNodes((current) =>
            current.map((node) =>
              node.id === pendingFile.nodeId
                ? {
                  ...node,
                  data: {
                    ...node.data,
                    content: `${pendingFile.file.name}\n\n${message}`,
                    status: "error",
                  },
                }
                : node,
            ),
          );
        }
      }
    },
    [currentProjectId, buildOptimisticAttachment],
  );

  const removeNodeAttachment = useCallback((nodeId: string, attachmentId: string) => {
    setNodes((current) =>
      current.map((node) => {
        if (node.id !== nodeId) {
          return node;
        }

        const removed = node.data.attachments.find((attachment) => attachment.id === attachmentId);
        if (removed?.previewUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(removed.previewUrl);
        }

        return { ...node, data: { ...node.data, attachments: node.data.attachments.filter((attachment) => attachment.id !== attachmentId) } };
      }),
    );
  }, []);

  const resizeNode = useCallback((nodeId: string, nextBounds: { width: number; height: number; x: number; y: number }) => {
    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId
          ? {
            ...node,
            position: { x: nextBounds.x, y: nextBounds.y },
            style: { ...node.style, width: nextBounds.width, height: nextBounds.height },
            data: { ...node.data, isPositionPinned: true },
          }
          : node,
      ),
    );
  }, []);

  const deleteNodesById = useCallback(
    (nodeIds: string[]) => {
      const initialIds = new Set(nodeIds);
      setNodes((current) => {
        const ids = new Set(initialIds);
        let changed = true;
        while (changed) {
          changed = false;
          for (const node of current) {
            if (node.data.parentId && ids.has(node.data.parentId) && !ids.has(node.id)) {
              ids.add(node.id);
              changed = true;
            }
          }
        }
        deletedNodeIdsRef.current = new Set([...deletedNodeIdsRef.current, ...ids]);
        ids.forEach((id) => {
          activeGenerationRunsRef.current.delete(id);
          delete streamedTextRef.current[id];
        });
        if (editingNodeId && ids.has(editingNodeId)) setEditingNodeId(null);
        if (focusedNodeId && ids.has(focusedNodeId)) setFocusedNodeId(null);
        setEdges((currentEdges) => currentEdges.filter((edge) => !ids.has(edge.source) && !ids.has(edge.target)).map(normalizeEdge));
        return current.filter((node) => !ids.has(node.id));
      });
    },
    [editingNodeId, focusedNodeId, setEdges],
  );

  const deleteSelected = useCallback(() => {
    const selectedNodeIds = nodesRef.current.filter((node) => node.selected).map((node) => node.id);
    const selectedEdgeIds = new Set(edgesRef.current.filter((edge) => edge.selected).map((edge) => edge.id));

    if (selectedNodeIds.length === 0 && selectedEdgeIds.size === 0) {
      return;
    }

    if (selectedNodeIds.length > 0) {
      deleteNodesById(selectedNodeIds);
      return;
    }

    setEdges((current) => current.filter((edge) => !selectedEdgeIds.has(edge.id)));
  }, [deleteNodesById, setEdges]);

  const selectAll = useCallback(() => {
    setNodes((current) => current.map((node) => ({ ...node, selected: true })));
    setEdges((current) => current.map((edge) => ({ ...edge, selected: true })));
  }, [setEdges]);

  const undoCanvasChange = useCallback(() => {
    const previousSnapshot = historyPastRef.current.pop();
    if (!previousSnapshot) {
      return;
    }

    const currentSnapshot = captureHistorySnapshot();
    historyFutureRef.current.push(currentSnapshot);
    applyHistorySnapshot(previousSnapshot);
  }, [applyHistorySnapshot, captureHistorySnapshot]);

  const redoCanvasChange = useCallback(() => {
    const nextSnapshot = historyFutureRef.current.pop();
    if (!nextSnapshot) {
      return;
    }

    const currentSnapshot = captureHistorySnapshot();
    historyPastRef.current.push(currentSnapshot);
    applyHistorySnapshot(nextSnapshot);
  }, [applyHistorySnapshot, captureHistorySnapshot]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable) {
        return;
      }

      const isMod = event.ctrlKey || event.metaKey;

      if (isMod && event.key === "c") {
        event.preventDefault();
        copySelected();
      } else if (isMod && event.key === "x") {
        event.preventDefault();
        cutSelected();
      } else if (isMod && event.key === "v") {
        event.preventDefault();
        paste();
      } else if (isMod && event.key === "a") {
        event.preventDefault();
        selectAll();
      } else if (isMod && !event.shiftKey && event.key === "z") {
        event.preventDefault();
        undoCanvasChange();
      } else if ((isMod && event.shiftKey && event.key === "Z") || (isMod && event.key === "y")) {
        event.preventDefault();
        redoCanvasChange();
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelected();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [copySelected, cutSelected, deleteSelected, paste, redoCanvasChange, selectAll, undoCanvasChange]);

  const getInsertedChildPosition = useCallback(
    (parentNode: Node<ConversationNodeRecord>, currentNodes: Array<Node<ConversationNodeRecord>>, currentEdges: Edge[], nextNode: Node<ConversationNodeRecord>, preferredPosition?: XYPosition) => {
      const siblingCount = currentNodes.filter((node) => node.data.parentId === parentNode.id).length;
      const nextWidth = Number(nextNode.style?.width ?? getNodeSize(nextNode.data.kind).width);
      const nextHeight = Number(nextNode.style?.height ?? getNodeSize(nextNode.data.kind).height);
      const suggested = getSuggestedChildPosition({
        nodes: currentNodes,
        edges: currentEdges,
        newNode: nextNode,
        newEdge: buildEdge(parentNode.id, nextNode.id),
        options: { nodeWidth: nextWidth, nodeHeight: nextHeight, rankSep: 48, nodeSep: 32 },
      });
      const parentWidth = Number(parentNode.style?.width ?? getNodeSize(parentNode.data.kind).width);
      const minimumX = parentNode.position.x + parentWidth + MIN_HORIZONTAL_GAP;
      const alignedTopY = parentNode.position.y;
      if (preferredPosition) {
        return findAvailablePosition(
          { x: Math.max(preferredPosition.x, minimumX), y: preferredPosition.y },
          { width: nextWidth, height: nextHeight },
          currentNodes,
        );
      }
      return findAvailablePosition(
        {
          x: Math.max(minimumX, suggested.x),
          y: siblingCount === 0 ? alignedTopY : alignedTopY + siblingCount * (nextHeight + 16),
        },
        { width: nextWidth, height: nextHeight },
        currentNodes,
      );
    },
    [],
  );

  const focusNode = useCallback(
    (nodeId: string, options?: { preserveViewport?: boolean }) => {
      const targetNode = nodesRef.current.find((node) => node.id === nodeId);
      if (!targetNode) return;
      if (options?.preserveViewport && !focusedNodeIdRef.current) {
        focusRestoreViewportRef.current = { x: viewport.x, y: viewport.y, zoom: viewport.zoom };
      }
      const focusWidth = Number(targetNode.style?.width ?? getNodeSize(targetNode.data.kind).width);
      const focusHeight = Number(targetNode.style?.height ?? getNodeSize(targetNode.data.kind).height);
      const wrapper = wrapperRef.current;
      const viewportWidth = wrapper?.clientWidth ?? 1440;
      const viewportHeight = wrapper?.clientHeight ?? 900;
      const horizontalPadding = 24;
      const targetZoom = Math.max(
        1.25,
        Math.min(
          2.85,
          (viewportWidth - horizontalPadding * 2) / focusWidth,
          (viewportHeight - 8) / (focusHeight - 68), // Target fitting the body height (subtracting approx header height)
        ),
      );
      setFocusedNodeId(nodeId);
      requestAnimationFrame(() => {
        void reactFlow.setCenter(targetNode.position.x + focusWidth / 2, targetNode.position.y + focusHeight / 2, {
          zoom: targetZoom,
          duration: 300,
          ease: easeOutCubic,
          interpolate: "smooth",
        });
      });
    },
    [reactFlow, viewport.x, viewport.y, viewport.zoom],
  );

  const getFocusNavigationTargetId = useCallback((nodeId: string, direction: "parent" | "child") => {
    const currentNodes = nodesRef.current;
    const currentNode = currentNodes.find((node) => node.id === nodeId);
    if (!currentNode) {
      return null;
    }

    if (direction === "parent") {
      return currentNode.data.parentId;
    }

    const children = currentNodes
      .filter((node) => node.data.parentId === nodeId)
      .sort((a, b) => {
        if (a.position.x !== b.position.x) return a.position.x - b.position.x;
        return a.position.y - b.position.y;
      });

    return children[0]?.id ?? null;
  }, []);

  const updatePromptMode = useCallback((nodeId: string, promptMode: ConversationPromptMode) => {
    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId
          ? {
            ...node,
            data: {
              ...node.data,
              promptMode,
              enabledTools: sanitizeEnabledToolsForPromptMode(node.data.enabledTools, promptMode),
              modelConfig: {
                provider: "gemini",
                name: getDefaultModelForPromptMode(promptMode, settings),
              },
            },
          }
          : node,
      ),
    );
  }, [settings]);

  const toggleNodeTool = useCallback((nodeId: string, tool: ConversationToolName) => {
    setNodes((current) =>
      current.map((node) => {
        if (node.id !== nodeId) {
          return node;
        }

        const promptMode = node.data.promptMode ?? "auto";
        const supportedTools = new Set(getSupportedToolsForPromptMode(promptMode));
        if (!supportedTools.has(tool)) {
          return {
            ...node,
            data: {
              ...node.data,
              enabledTools: sanitizeEnabledToolsForPromptMode(node.data.enabledTools, promptMode),
            },
          };
        }

        const currentTools = new Set(sanitizeEnabledToolsForPromptMode(node.data.enabledTools, promptMode));
        if (currentTools.has(tool)) {
          currentTools.delete(tool);
        } else {
          currentTools.add(tool);
        }

        return {
          ...node,
          data: {
            ...node.data,
            enabledTools: Array.from(currentTools),
          },
        };
      }),
    );
  }, []);

  const navigateFocusedNode = useCallback(
    (direction: "parent" | "child") => {
      const currentFocusedNodeId = focusedNodeIdRef.current;
      if (!currentFocusedNodeId) {
        return;
      }

      const targetNodeId = getFocusNavigationTargetId(currentFocusedNodeId, direction);
      if (!targetNodeId || targetNodeId === currentFocusedNodeId) {
        return;
      }

      focusNode(targetNodeId);
    },
    [focusNode, getFocusNavigationTargetId],
  );

  const runAutoLayout = useCallback(() => {
    setNodes((current) =>
      layoutNodesForMindMap({
        nodes: current.map((node) => normalizeNode(node)),
        edges,
        options: { nodeWidth: getNodeDefaultSize("ai").width, nodeHeight: getNodeDefaultSize("ai").height, rankSep: 40, nodeSep: 25 },
      }).map((node) => ({ ...node, selected: false })),
    );
    requestAnimationFrame(() => {
      void reactFlow.fitView({ padding: 0.18, duration: 320 });
    });
  }, [edges, reactFlow]);

  const buildPromptRequestLineage = useCallback(
    (
      targetNodeId: string,
      currentNodes: Array<Node<ConversationNodeRecord>>,
      currentEdges: Edge[],
      promptMode: ConversationPromptMode,
    ): PromptRequestContext => {
      const lineage = buildLineageContext(currentNodes, targetNodeId);
      const incomingContext = currentEdges
        .filter((edge) => edge.target === targetNodeId)
        .map((edge) => currentNodes.find((node) => node.id === edge.source))
        .filter((node): node is Node<ConversationNodeRecord> => Boolean(node))
        .filter((node) => node.id !== targetNodeId);

      if (incomingContext.length === 0) {
        return {
          lineage: lineage.map((entry) => ({
            ...entry,
            attachments: filterAttachmentsForPromptMode(entry.attachments, promptMode),
          })),
          inputNodeIds: [],
        };
      }

      const existingIds = new Set(lineage.map((entry) => entry.id));
      const extraEntries = incomingContext
        .filter((node) => shouldIncludeNodeAsPromptInput(node, promptMode))
        .filter((node) => !existingIds.has(node.id))
        .map((node) => ({
          id: node.id,
          parentId: node.data.parentId,
          kind: node.data.kind,
          content: node.data.content,
          attachments: filterAttachmentsForPromptMode(node.data.attachments, promptMode),
          status: node.data.status,
          createdAt: node.data.createdAt,
        }));

      return {
        lineage: [
          ...extraEntries,
          ...lineage.map((entry) => ({
            ...entry,
            attachments: filterAttachmentsForPromptMode(entry.attachments, promptMode),
          })),
        ],
        inputNodeIds: extraEntries.map((entry) => entry.id),
      };
    },
    [],
  );

  const runAiGenerationForUserNode = useCallback(
    async (parentNode: Node<ConversationNodeRecord>, preferredPosition?: XYPosition) => {
      const latestNodes = nodesRef.current;
      const latestEdges = edgesRef.current;
      const latestParentNode = latestNodes.find((node) => node.id === parentNode.id);
      if (!latestParentNode) {
        return;
      }

      const prompt = latestParentNode.data.content.trim();
      if (!prompt) {
        setEditingNodeId(latestParentNode.id);
        return;
      }
      const promptMode = latestParentNode.data.promptMode ?? "auto";
      const enabledTools = sanitizeEnabledToolsForPromptMode(latestParentNode.data.enabledTools, promptMode);
      const requestContext = buildPromptRequestLineage(latestParentNode.id, latestNodes, latestEdges, promptMode);
      const lineage = requestContext.lineage;
      const nextNodeId = crypto.randomUUID();
      deletedNodeIdsRef.current.delete(nextNodeId);
      const generationRunId = beginGenerationRun(nextNodeId);
      const activeModelName = latestParentNode.data.modelConfig?.name ?? GEMINI_TEXT_MODEL_NAME;
      const draftNode = buildNode(nextNodeId, latestParentNode.position, {
        parentId: latestParentNode.id,
        kind: "ai",
        content: "",
        attachments: [],
        modelConfig: { provider: "gemini", name: activeModelName },
        promptMode: latestParentNode.data.promptMode ?? "auto",
        status: "generating",
        createdAt: timestampLabel(),
        isRoot: false,
        isPositionPinned: false,
      });
      const position = getInsertedChildPosition(latestParentNode, latestNodes, latestEdges, draftNode, preferredPosition);
      setEditingNodeId(null);
      setNodes((latest) => {
        if (!latest.some((node) => node.id === latestParentNode.id)) {
          return latest;
        }
        return [...latest.map((node) => ({ ...node, selected: false })), { ...draftNode, position, selected: false }];
      });
      setEdges((latest) => {
        if (!nodesRef.current.some((node) => node.id === latestParentNode.id)) {
          return latest;
        }
        return latest.concat(buildEdge(latestParentNode.id, nextNodeId)).map(normalizeEdge);
      });
      setActiveGenerationEdges(
        requestContext.inputNodeIds.map((sourceId) => `${sourceId}->${latestParentNode.id}`),
      );

      try {
        const result = await requestGeminiText({
          targetNodeId: latestParentNode.id,
          lineage,
          model: { provider: "gemini", name: activeModelName },
          projectId: currentProjectId,
          promptMode,
          enabledTools,
          onTextDelta: (text) => {
            if (deletedNodeIdsRef.current.has(nextNodeId)) {
              return;
            }
            scheduleStreamedNodeContentUpdate(nextNodeId, text, generationRunId);
          },
        });
        if (deletedNodeIdsRef.current.has(nextNodeId)) {
          return;
        }
        clearGenerationRun(nextNodeId, generationRunId);
        clearActiveGenerationEdges(requestContext.inputNodeIds.map((sourceId) => `${sourceId}->${latestParentNode.id}`));
        setNodes((latest) =>
          latest.map((node) =>
            node.id === nextNodeId
              ? {
                ...node,
                style: {
                  ...node.style,
                  ...getContentAwareNodeSize("ai", result.text),
                },
                data: {
                  ...node.data,
                  content: result.text,
                  modelConfig: { provider: "gemini", name: isSupportedTextModelName(result.model) ? result.model : activeModelName },
                  tokenCount: result.tokenCount ?? undefined,
                  status: "idle",
                },
              }
              : node,
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : CANVAS_COPY.geminiRequestFailed;
        if (deletedNodeIdsRef.current.has(nextNodeId)) {
          return;
        }
        clearGenerationRun(nextNodeId, generationRunId);
        clearActiveGenerationEdges(requestContext.inputNodeIds.map((sourceId) => `${sourceId}->${latestParentNode.id}`));
        setNodes((latest) =>
          latest.map((node) =>
            node.id === nextNodeId
              ? {
                ...node,
                data: {
                  ...node.data,
                  content: `${CANVAS_COPY.generateFailedPrefix}\n\n${message}`,
                  status: "error",
                },
              }
              : node,
          ),
        );
      }
    },
    [beginGenerationRun, buildPromptRequestLineage, clearActiveGenerationEdges, clearGenerationRun, currentProjectId, getInsertedChildPosition, scheduleStreamedNodeContentUpdate, setActiveGenerationEdges, setEdges],
  );

  const runCodeGenerationForUserNode = useCallback(
    async (parentNode: Node<ConversationNodeRecord>, preferredPosition?: XYPosition) => {
      const latestNodes = nodesRef.current;
      const latestEdges = edgesRef.current;
      const latestParentNode = latestNodes.find((node) => node.id === parentNode.id);
      if (!latestParentNode) {
        return;
      }

      const prompt = latestParentNode.data.content.trim();
      if (!prompt) {
        setEditingNodeId(latestParentNode.id);
        return;
      }

      const requestContext = buildPromptRequestLineage(latestParentNode.id, latestNodes, latestEdges, "code");
      const codeNodeId = crypto.randomUUID();
      const resultNodeId = crypto.randomUUID();
      deletedNodeIdsRef.current.delete(codeNodeId);
      deletedNodeIdsRef.current.delete(resultNodeId);
      const draftCodeNode = buildNode(codeNodeId, latestParentNode.position, {
        parentId: latestParentNode.id,
        kind: "code",
        content: "",
        attachments: [],
        promptMode: "code",
        status: "generating",
        createdAt: timestampLabel(),
        isRoot: false,
        isPositionPinned: false,
      });
      const codePosition = getInsertedChildPosition(latestParentNode, latestNodes, latestEdges, draftCodeNode, preferredPosition);
      const draftResultNode = buildNode(resultNodeId, codePosition, {
        parentId: codeNodeId,
        kind: "result",
        content: "",
        attachments: [],
        status: "generating",
        createdAt: timestampLabel(),
        isRoot: false,
        isPositionPinned: false,
      });
      const resultPosition = findAvailablePosition(
        {
          x: codePosition.x + Number(draftCodeNode.style?.width ?? getNodeDefaultSize("code").width) + 56,
          y: codePosition.y,
        },
        getNodeDefaultSize("result"),
        latestNodes.concat([{ ...draftCodeNode, position: codePosition }]),
      );
      setEditingNodeId(null);
      setNodes((latest) => {
        if (!latest.some((node) => node.id === latestParentNode.id)) {
          return latest;
        }
        return [
          ...latest.map((node) => ({ ...node, selected: false })),
          { ...draftCodeNode, position: codePosition, selected: false },
          { ...draftResultNode, position: resultPosition, selected: false },
        ];
      });
      setEdges((latest) => {
        if (!nodesRef.current.some((node) => node.id === latestParentNode.id)) {
          return latest;
        }
        return latest
          .concat(buildEdge(latestParentNode.id, codeNodeId), buildEdge(codeNodeId, resultNodeId))
          .map(normalizeEdge);
      });
      setActiveGenerationEdges([
        ...requestContext.inputNodeIds.map((sourceId) => `${sourceId}->${latestParentNode.id}`),
        `${latestParentNode.id}->${codeNodeId}`,
        `${codeNodeId}->${resultNodeId}`,
      ]);

      try {
        const generatedCode = extractPythonCode(
          (
            await requestGeminiText({
              targetNodeId: latestParentNode.id,
              lineage: buildCodeGenerationLineage(requestContext.lineage),
              model: { provider: "gemini", name: latestParentNode.data.modelConfig?.name ?? GEMINI_TEXT_MODEL_NAME },
              projectId: currentProjectId,
              promptMode: "auto",
              enabledTools: [],
            })
          ).text,
        );
        const inputAttachments = requestContext.lineage.flatMap((entry) => entry.attachments);
        const result = await executePyodideCode({
          code: generatedCode,
          attachments: inputAttachments,
          contextText: buildPyodideContextText(requestContext.lineage),
          projectId: currentProjectId,
        });

        if (deletedNodeIdsRef.current.has(codeNodeId) || deletedNodeIdsRef.current.has(resultNodeId)) {
          return;
        }

        clearActiveGenerationEdges([
          ...requestContext.inputNodeIds.map((sourceId) => `${sourceId}->${latestParentNode.id}`),
          `${latestParentNode.id}->${codeNodeId}`,
          `${codeNodeId}->${resultNodeId}`,
        ]);
setNodes((latest) =>
          latest.map((node) =>
            node.id === codeNodeId
              ? {
                  ...node,
                  style: {
                    ...node.style,
                    ...getContentAwareNodeSize("code", buildCodeNodeContent({
                      code: generatedCode,
                      taskGoal: prompt,
                      packages: result.detectedPackages,
                      stagedInputs: result.stagedInputs,
                    })),
                  },
                  data: {
                    ...node.data,
                    content: buildCodeNodeContent({
                      code: generatedCode,
                      taskGoal: prompt,
                      packages: result.detectedPackages,
                      stagedInputs: result.stagedInputs,
                    }),
                    taskGoal: prompt,
                    status: "idle",
                  },
                }
              : node.id === resultNodeId
                ? {
                    ...node,
                    style: {
                      ...node.style,
                      ...getContentAwareNodeSize("result", buildResultNodeContent(result), result.attachments),
                    },
                  data: {
                    ...node.data,
                    content: buildResultNodeContent(result),
                    attachments: result.attachments,
                    status: "idle",
                    },
                  }
              : node,
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : CANVAS_COPY.pyodideRunFailed;
        if (deletedNodeIdsRef.current.has(codeNodeId) || deletedNodeIdsRef.current.has(resultNodeId)) {
          return;
        }
        clearActiveGenerationEdges([
          ...requestContext.inputNodeIds.map((sourceId) => `${sourceId}->${latestParentNode.id}`),
          `${latestParentNode.id}->${codeNodeId}`,
          `${codeNodeId}->${resultNodeId}`,
        ]);
        setNodes((latest) =>
          latest.map((node) =>
            node.id === codeNodeId
              ? {
                ...node,
                data: {
                  ...node.data,
                  content: `## Code Generation Failed\n\n${message}`,
                  status: "error",
                },
              }
              : node.id === resultNodeId
                ? {
                  ...node,
                  data: {
                    ...node.data,
                    content: `## Execution Failed\n\n${message}`,
                    attachments: [],
                    status: "error",
                  },
                }
              : node,
          ),
        );
      }
    },
    [buildPromptRequestLineage, clearActiveGenerationEdges, currentProjectId, getInsertedChildPosition, setActiveGenerationEdges, setEdges],
  );

  const runImageGenerationForUserNode = useCallback(
    async (parentNode: Node<ConversationNodeRecord>) => {
      const latestNodes = nodesRef.current;
      const latestEdges = edgesRef.current;
      const latestParentNode = latestNodes.find((node) => node.id === parentNode.id);
      if (!latestParentNode) {
        return;
      }

      const prompt = latestParentNode.data.content.trim();
      if (!prompt) {
        setEditingNodeId(latestParentNode.id);
        return;
      }
      const activeImageModelName = getActiveImageModel(latestParentNode.data.modelConfig?.name);

      const nextNodeId = crypto.randomUUID();
      deletedNodeIdsRef.current.delete(nextNodeId);
      const draftNode = buildNode(nextNodeId, latestParentNode.position, {
        parentId: latestParentNode.id,
        kind: "image",
        content: prompt,
        attachments: [],
        modelConfig: { provider: "gemini", name: activeImageModelName },
        status: "generating",
        createdAt: timestampLabel(),
        isRoot: false,
        isPositionPinned: false,
      });
      const position = getInsertedChildPosition(latestParentNode, latestNodes, latestEdges, draftNode, {
        x: latestParentNode.position.x + Number(latestParentNode.style?.width ?? getNodeDefaultSize("user").width) + 56,
        y: latestParentNode.position.y,
      });

      setNodes((latest) => {
        if (!latest.some((node) => node.id === latestParentNode.id)) {
          return latest;
        }
        return [...latest.map((node) => ({ ...node, selected: false })), { ...draftNode, position, selected: false }];
      });
      setEdges((latest) => {
        if (!nodesRef.current.some((node) => node.id === latestParentNode.id)) {
          return latest;
        }
        return latest.concat(buildEdge(latestParentNode.id, nextNodeId)).map(normalizeEdge);
      });

      let activeEdgeIds: string[] = [];
      try {
        const requestContext = buildPromptRequestLineage(latestParentNode.id, latestNodes, latestEdges, "image-create");
        const lineage = requestContext.lineage;
        const allowedInputAttachments = filterAttachmentsForPromptMode(latestParentNode.data.attachments, "image-create");
        activeEdgeIds = requestContext.inputNodeIds.map((sourceId) => `${sourceId}->${latestParentNode.id}`);
        setActiveGenerationEdges(activeEdgeIds);
        const result = await requestGeminiImage({
          prompt,
          attachments: allowedInputAttachments,
          lineage,
          modelName: activeImageModelName,
          projectId: currentProjectId,
        });
        if (deletedNodeIdsRef.current.has(nextNodeId)) {
          return;
        }
        clearActiveGenerationEdges(activeEdgeIds);

        setNodes((latest) =>
          latest.map((node) =>
            node.id === nextNodeId
              ? {
                ...node,
                style: {
                  ...node.style,
                  width: getNodeDefaultSize("image").width,
                  height: getNodeDefaultSize("image").height,
                },
                data: {
                  ...node.data,
                  attachments: result.attachments,
                  tokenCount: result.tokenCount ?? undefined,
                  status: "idle",
                  modelConfig: { provider: "gemini", name: isSupportedImageModelName(result.model) ? result.model : activeImageModelName },
                },
              }
              : node,
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : CANVAS_COPY.imageRequestFailed;
        if (deletedNodeIdsRef.current.has(nextNodeId)) {
          return;
        }
        clearActiveGenerationEdges(activeEdgeIds);
        setNodes((latest) =>
          latest.map((node) =>
            node.id === nextNodeId
              ? {
                ...node,
                data: {
                  ...node.data,
                  content: `${prompt}\n\n${CANVAS_COPY.imageGenerateFailedPrefix}\n${message}`,
                  status: "error",
                },
              }
              : node,
          ),
        );
      }
    },
    [buildPromptRequestLineage, clearActiveGenerationEdges, currentProjectId, getInsertedChildPosition, setActiveGenerationEdges, setEdges],
  );

  const createEditableTextNode = useCallback(
    (params: {
      position: XYPosition;
      parentNodeId: string | null;
      kind?: "user" | "note";
      anchor?: "top-left" | "left-center";
    }) => {
      const latestNodes = nodesRef.current;
      const latestEdges = edgesRef.current;
      const nextNodeId = crypto.randomUUID();
      deletedNodeIdsRef.current.delete(nextNodeId);
      const kind = params.kind ?? "user";
      const anchor = params.anchor ?? "top-left";
      const record: ConversationNodeRecord = {
        parentId: params.parentNodeId,
        kind,
        content: "",
        attachments: [],
        modelConfig: kind === "user" ? { provider: "gemini", name: defaultUserModel } : undefined,
        promptMode: kind === "user" ? "auto" : undefined,
        enabledTools: kind === "user" ? [] : undefined,
        status: "idle",
        createdAt: timestampLabel(),
        isRoot: params.parentNodeId === null,
        isPositionPinned: false,
      };
      const baseSize = getNodeSize(kind);
      const anchoredPosition =
        anchor === "left-center"
          ? { x: params.position.x, y: params.position.y - baseSize.height / 2 }
          : params.position;
      const draftNode = buildNode(nextNodeId, anchoredPosition, record);
      const parentNode = params.parentNodeId ? latestNodes.find((node) => node.id === params.parentNodeId) : null;
      const position = parentNode
        ? getInsertedChildPosition(parentNode, latestNodes, latestEdges, draftNode, anchoredPosition)
        : findAvailablePosition(anchoredPosition, baseSize, latestNodes);
      const nextEdges = parentNode ? latestEdges.concat(buildEdge(parentNode.id, nextNodeId)).map(normalizeEdge) : latestEdges;
      setNodes((latest) => [...latest.map((node) => ({ ...node, selected: false })), { ...draftNode, position, selected: true }]);
      setEdges(nextEdges);
      setEditingNodeId(nextNodeId);
      setMenu(null);
      setFocusedNodeId(null);
    },
    [defaultUserModel, getInsertedChildPosition, setEdges],
  );

  const createEditableUserNode = useCallback(
    (params: { position: XYPosition; parentNodeId: string | null; anchor?: "top-left" | "left-center" }) => {
      createEditableTextNode({ ...params, kind: "user" });
    },
    [createEditableTextNode],
  );

  const createEditableNoteNode = useCallback(
    (params: { position: XYPosition; parentNodeId: string | null; anchor?: "top-left" | "left-center" }) => {
      createEditableTextNode({ ...params, kind: "note" });
    },
    [createEditableTextNode],
  );

  const createRootNodeFromViewport = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    createEditableUserNode({
      position: reactFlow.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }),
      parentNodeId: null,
    });
  }, [createEditableUserNode, reactFlow]);

  const regenerateAiNode = useCallback(async (nodeId: string) => {
    const latestNodes = nodesRef.current;
    const latestEdges = edgesRef.current;
    const targetNode = latestNodes.find((node) => node.id === nodeId);
    if (!targetNode || targetNode.data.kind !== "ai" || !targetNode.data.parentId) return;
    const activeModelName = targetNode.data.modelConfig?.name ?? GEMINI_TEXT_MODEL_NAME;
    const promptMode = targetNode.data.promptMode ?? "auto";
    const enabledTools = sanitizeEnabledToolsForPromptMode(targetNode.data.enabledTools, promptMode);
    const requestContext = buildPromptRequestLineage(targetNode.data.parentId, latestNodes, latestEdges, promptMode);
    const lineage = requestContext.lineage;
    const generationRunId = beginGenerationRun(nodeId);
    setActiveGenerationEdges(requestContext.inputNodeIds.map((sourceId) => `${sourceId}->${targetNode.data.parentId}`));
    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId
          ? {
            ...node,
            data: {
              ...node.data,
              content: "",
              modelConfig: { provider: "gemini", name: activeModelName },
              tokenCount: undefined,
              status: "generating",
              createdAt: timestampLabel(),
            },
          }
          : node,
      ),
    );
    try {
      const result = await requestGeminiText({
        targetNodeId: targetNode.data.parentId,
        lineage,
        model: { provider: "gemini", name: activeModelName },
        projectId: currentProjectId,
        promptMode: targetNode.data.promptMode ?? "auto",
        enabledTools,
        onTextDelta: (text) => {
          if (deletedNodeIdsRef.current.has(nodeId)) {
            return;
          }
          scheduleStreamedNodeContentUpdate(nodeId, text, generationRunId);
        },
      });
      if (deletedNodeIdsRef.current.has(nodeId)) {
        return;
      }
      clearGenerationRun(nodeId, generationRunId);
      clearActiveGenerationEdges(requestContext.inputNodeIds.map((sourceId) => `${sourceId}->${targetNode.data.parentId}`));
      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId
            ? {
              ...node,
              style: {
                ...node.style,
                ...getContentAwareNodeSize("ai", result.text),
              },
              data: {
                ...node.data,
                content: result.text,
                modelConfig: { provider: "gemini", name: isSupportedTextModelName(result.model) ? result.model : activeModelName },
                tokenCount: result.tokenCount ?? undefined,
                status: "idle",
                createdAt: timestampLabel(),
              },
            }
            : node,
        ),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : CANVAS_COPY.geminiRequestFailed;
      if (deletedNodeIdsRef.current.has(nodeId)) {
        return;
      }
      clearGenerationRun(nodeId, generationRunId);
      clearActiveGenerationEdges(requestContext.inputNodeIds.map((sourceId) => `${sourceId}->${targetNode.data.parentId}`));
      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId
            ? {
              ...node,
              data: {
                ...node.data,
                content: `${CANVAS_COPY.generateFailedPrefix}\n\n${message}`,
                status: "error",
                createdAt: timestampLabel(),
              },
            }
            : node,
        ),
      );
    }
  }, [beginGenerationRun, buildPromptRequestLineage, clearActiveGenerationEdges, clearGenerationRun, currentProjectId, scheduleStreamedNodeContentUpdate, setActiveGenerationEdges]);

  const regenerateCodeNode = useCallback(
    async (nodeId: string) => {
      const latestNodes = nodesRef.current;
      const targetNode = latestNodes.find((node) => node.id === nodeId);
      if (!targetNode) return;

      const codeNode =
        targetNode.data.kind === "code"
          ? targetNode
          : targetNode.data.kind === "result" && targetNode.data.parentId
            ? latestNodes.find((node) => node.id === targetNode.data.parentId && node.data.kind === "code")
            : null;
      if (!codeNode || !codeNode.data.parentId) return;

      const parentNode = latestNodes.find((node) => node.id === codeNode.data.parentId);
      if (!parentNode || parentNode.data.kind !== "user") return;
      const parentPrompt = parentNode.data.content.trim();
      const resultNode = latestNodes.find((node) => node.data.kind === "result" && node.data.parentId === codeNode.id);

      setNodes((current) =>
        current.map((node) =>
          node.id === codeNode.id
            ? {
              ...node,
              data: {
                ...node.data,
                content: "",
                attachments: [],
                tokenCount: undefined,
                status: "generating",
                createdAt: timestampLabel(),
              },
            }
            : resultNode && node.id === resultNode.id
              ? {
                ...node,
                data: {
                  ...node.data,
                  content: "",
                  attachments: [],
                  tokenCount: undefined,
                  status: "generating",
                  createdAt: timestampLabel(),
                },
              }
            : node,
        ),
      );

      let activeEdgeIds: string[] = [];
      try {
        const requestContext = buildPromptRequestLineage(parentNode.id, nodesRef.current, edgesRef.current, "code");
        activeEdgeIds = [
          ...requestContext.inputNodeIds.map((sourceId) => `${sourceId}->${parentNode.id}`),
          `${parentNode.id}->${codeNode.id}`,
          ...(resultNode ? [`${codeNode.id}->${resultNode.id}`] : []),
        ];
        setActiveGenerationEdges(activeEdgeIds);
        const generatedCode = extractPythonCode(
          (
            await requestGeminiText({
              targetNodeId: parentNode.id,
              lineage: buildCodeGenerationLineage(requestContext.lineage),
              model: { provider: "gemini", name: parentNode.data.modelConfig?.name ?? GEMINI_TEXT_MODEL_NAME },
              projectId: currentProjectId,
              promptMode: "auto",
              enabledTools: [],
            })
          ).text,
        );
        const result = await executePyodideCode({
          code: generatedCode,
          attachments: requestContext.lineage.flatMap((entry) => entry.attachments),
          contextText: buildPyodideContextText(requestContext.lineage),
          projectId: currentProjectId,
        });

        if (deletedNodeIdsRef.current.has(codeNode.id) || (resultNode && deletedNodeIdsRef.current.has(resultNode.id))) {
          return;
        }
        clearActiveGenerationEdges(activeEdgeIds);

        setNodes((current) =>
          current.map((node) =>
            node.id === codeNode.id
              ? {
                  ...node,
                  style: {
                    ...node.style,
                    ...getContentAwareNodeSize("code", buildCodeNodeContent({
                      code: generatedCode,
                      taskGoal: parentPrompt,
                      packages: result.detectedPackages,
                      stagedInputs: result.stagedInputs,
                    })),
                  },
                  data: {
                    ...node.data,
                    content: buildCodeNodeContent({
                      code: generatedCode,
                      taskGoal: parentPrompt,
                      packages: result.detectedPackages,
                      stagedInputs: result.stagedInputs,
                    }),
                    taskGoal: parentPrompt,
                    status: "idle",
                  },
                }
: resultNode && node.id === resultNode.id
                ? {
                    ...node,
                    style: {
                      ...node.style,
                      ...getContentAwareNodeSize("result", buildResultNodeContent(result), result.attachments),
                    },
                    data: {
                      ...node.data,
                      content: buildResultNodeContent(result),
                      attachments: result.attachments,
                      status: "idle",
                    },
                  }
              : node,
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : CANVAS_COPY.pyodideRunFailed;
        if (deletedNodeIdsRef.current.has(codeNode.id) || (resultNode && deletedNodeIdsRef.current.has(resultNode.id))) {
          return;
        }
        clearActiveGenerationEdges(activeEdgeIds);

        setNodes((current) =>
          current.map((node) =>
            node.id === codeNode.id
              ? {
                ...node,
                data: {
                  ...node.data,
                  content: `## Code Generation Failed\n\n${message}`,
                  status: "error",
                },
              }
              : resultNode && node.id === resultNode.id
                ? {
                  ...node,
                  data: {
                    ...node.data,
                    content: `## Execution Failed\n\n${message}`,
                    attachments: [],
                    status: "error",
                  },
                }
              : node,
          ),
        );
      }
    },
    [buildPromptRequestLineage, clearActiveGenerationEdges, currentProjectId, setActiveGenerationEdges],
  );

  const regenerateImageNode = useCallback(
    async (nodeId: string) => {
      const latestNodes = nodesRef.current;
      const targetNode = latestNodes.find((node) => node.id === nodeId);
      if (!targetNode || targetNode.data.kind !== "image" || !targetNode.data.parentId) return;
      const parentNode = latestNodes.find((node) => node.id === targetNode.data.parentId);
      if (!parentNode || parentNode.data.kind !== "user") return;
      const latestEdges = edgesRef.current;
      const activeImageModelName = getActiveImageModel(targetNode.data.modelConfig?.name);

      const prompt = parentNode.data.content.trim();
      if (!prompt) {
        setEditingNodeId(parentNode.id);
        return;
      }

      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId
            ? {
              ...node,
              data: {
                ...node.data,
                content: prompt,
                attachments: [],
                tokenCount: undefined,
                status: "generating",
                createdAt: timestampLabel(),
              },
            }
            : node,
        ),
      );

      let activeEdgeIds: string[] = [];
      try {
        const requestContext = buildPromptRequestLineage(parentNode.id, latestNodes, latestEdges, "image-create");
        const lineage = requestContext.lineage;
        const allowedInputAttachments = filterAttachmentsForPromptMode(parentNode.data.attachments, "image-create");
        activeEdgeIds = requestContext.inputNodeIds.map((sourceId) => `${sourceId}->${parentNode.id}`);
        setActiveGenerationEdges(activeEdgeIds);
        const result = await requestGeminiImage({
          prompt,
          attachments: allowedInputAttachments,
          lineage,
          modelName: activeImageModelName,
          projectId: currentProjectId,
        });
        if (deletedNodeIdsRef.current.has(nodeId)) {
          return;
        }
        clearActiveGenerationEdges(activeEdgeIds);
        setNodes((current) =>
          current.map((node) =>
            node.id === nodeId
              ? {
                ...node,
                data: {
                  ...node.data,
                  content: prompt,
                  attachments: result.attachments,
                  tokenCount: result.tokenCount ?? undefined,
                  status: "idle",
                  modelConfig: { provider: "gemini", name: isSupportedImageModelName(result.model) ? result.model : activeImageModelName },
                  createdAt: timestampLabel(),
                },
              }
              : node,
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : CANVAS_COPY.imageRequestFailed;
        if (deletedNodeIdsRef.current.has(nodeId)) {
          return;
        }
        clearActiveGenerationEdges(activeEdgeIds);
        setNodes((current) =>
          current.map((node) =>
            node.id === nodeId
              ? {
                ...node,
                data: {
                  ...node.data,
                  content: `${prompt}\n\n${CANVAS_COPY.imageGenerateFailedPrefix}\n${message}`,
                  attachments: [],
                  status: "error",
                  createdAt: timestampLabel(),
                },
              }
              : node,
          ),
        );
      }
    },
    [buildPromptRequestLineage, clearActiveGenerationEdges, currentProjectId, setActiveGenerationEdges],
  );

  useEffect(() => {
    nodeActionRefs.current = {
      addNodeAttachments,
      addNodeUrlAttachment,
      removeNodeAttachment,
      updateNodeModel,
      updatePromptMode,
      toggleNodeTool,
      updateUserNodeContent,
      resizeNode,
      setEditingNodeId,
      runAiGenerationForUserNode,
      runCodeGenerationForUserNode,
      runImageGenerationForUserNode,
      regenerateAiNode,
      regenerateCodeNode,
      regenerateImageNode,
      runCodeNode: async (nodeId: string) => {
        const targetNode = nodesRef.current.find((n) => n.id === nodeId);
        if (!targetNode || targetNode.data.kind !== "code" || !targetNode.data.parentId) return;

        const codeNode = targetNode;
        const parentNode = nodesRef.current.find((n) => n.id === codeNode.data.parentId);
        if (!parentNode || parentNode.data.kind !== "user") return;

        const generatedCodeMatch = codeNode.data.content.match(/```python\n([\s\S]*?)```/);
        const originalCode = generatedCodeMatch ? generatedCodeMatch[1].trim() : codeNode.data.content;
        if (!originalCode) return;

        // Inject file detection code at the beginning
        const fileDetectionCode = `
import os

# Available input files in /workspace/inputs/
_input_files = os.listdir('/workspace/inputs/')
print("=== Available Input Files ===")
for f in _input_files:
    print(f"  - {f}")
print("================================")

# Your code starts below:
`;

        const generatedCode = fileDetectionCode + originalCode;

        const resultNode = nodesRef.current.find((n) => n.data.kind === "result" && n.data.parentId === codeNode.id);
        if (!resultNode) return;

        const timestampLabel = () => {
          const now = new Date();
          return now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        };

        setNodes((current) =>
          current.map((node) =>
            node.id === resultNode.id
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    content: "",
                    attachments: [],
                    tokenCount: undefined,
                    status: "generating",
                    createdAt: timestampLabel(),
                  },
                }
              : node,
          ),
        );

        const activeEdgeIds = [
          `${parentNode.id}->${codeNode.id}`,
          `${codeNode.id}->${resultNode.id}`,
        ];
        setActiveGenerationEdges(activeEdgeIds);

        try {
          const contextText = parentNode.data.content;
          const codeNodeAttachments = codeNode.data.attachments;
          const parentAttachments = parentNode.data.attachments;

          // Filter out failed uploads (temp- attachments without valid URLs)
          const validCodeNodeAttachments = codeNodeAttachments.filter(
            (att) => att.id.startsWith("temp-") ? false : (att.url && att.storagePath)
          );
          const validParentAttachments = parentAttachments.filter(
            (att) => att.id.startsWith("temp-") ? false : (att.url && att.storagePath)
          );
          const allAttachments = [...validCodeNodeAttachments, ...validParentAttachments];

          console.log("=== Code Node Execution Debug ===");
          console.log("Code node attachments (raw):", codeNodeAttachments);
          console.log("Code node attachments (valid):", validCodeNodeAttachments);
          console.log("Parent attachments (valid):", validParentAttachments);
          console.log("All attachments (valid):", allAttachments);
          console.log("===================================");

          if (allAttachments.length === 0 && (codeNodeAttachments.length > 0 || parentAttachments.length > 0)) {
            // Some attachments failed to upload
            console.warn("Some attachments failed to upload, proceeding with available ones");
          }

          const result = await executePyodideCode({
            code: generatedCode,
            attachments: allAttachments,
            contextText,
          });

          setActiveGenerationEdges([]);

          if (deletedNodeIdsRef.current.has(codeNode.id) || deletedNodeIdsRef.current.has(resultNode.id)) {
            return;
          }

          const resultContent = buildResultNodeContent(result);
          const uploadedArtifacts: ConversationAttachment[] = [];
          if (result.files.length > 0) {
            const artifacts = await uploadFiles(
              result.files.map((file) =>
                base64ToFile({
                  bytesBase64: file.bytesBase64,
                  fileName: file.name,
                  mimeType: file.mimeType,
                }),
              ),
              currentProjectId,
            );
            uploadedArtifacts.push(...artifacts);
          }

          setNodes((current) =>
            current.map((node) =>
              node.id === codeNode.id
                ? {
                    ...node,
                    data: {
                      ...node.data,
                      content: buildCodeNodeContent({
                        code: generatedCode,
                        packages: result.detectedPackages,
                        stagedInputs: result.stagedInputs,
                      }),
                    },
                  }
                : node.id === resultNode.id
                  ? {
                      ...node,
                      data: {
                        ...node.data,
                        content: resultContent,
                        attachments: uploadedArtifacts,
                        status: result.success ? "idle" : "error",
                      },
                    }
                  : node,
            ),
          );
        } catch (error) {
          setActiveGenerationEdges([]);
          console.error("Code execution failed:", error);
          setNodes((current) =>
            current.map((node) =>
              node.id === resultNode.id
                ? {
                    ...node,
                    data: {
                      ...node.data,
                      content: `## Execution Failed\n\n\`\`\`\n${error instanceof Error ? error.message : "Unknown error"}\n\`\`\``,
                      status: "error",
                    },
                  }
                : node,
            ),
          );
        }
      },
      focusNode,
    };
  }, [
    addNodeAttachments,
    addNodeUrlAttachment,
    focusNode,
    regenerateAiNode,
    regenerateCodeNode,
    regenerateImageNode,
    removeNodeAttachment,
    resizeNode,
    runAiGenerationForUserNode,
    runCodeGenerationForUserNode,
    runImageGenerationForUserNode,
    toggleNodeTool,
    updateNodeModel,
    updatePromptMode,
    updateUserNodeContent,
    setActiveGenerationEdges,
  ]);

  const getNodeHandlers = useCallback((nodeId: string, kind: ConversationNodeRecord["kind"]): NodeHandlerSet => {
    const cached = nodeHandlerCacheRef.current.get(nodeId);
    if (cached) {
      return cached;
    }

    const handlers: NodeHandlerSet = {
      isMultiDragging,
      onAddAttachments:
        kind === "user" || kind === "code" ? (files: File[]) => void nodeActionRefs.current?.addNodeAttachments(nodeId, files) : undefined,
      onAddUrlAttachment:
        kind === "user" || kind === "code" ? async (url: string) => await nodeActionRefs.current?.addNodeUrlAttachment(nodeId, url) : undefined,
      onRemoveAttachment:
        kind === "user" || kind === "code"
          ? (attachmentId: string) => nodeActionRefs.current?.removeNodeAttachment(nodeId, attachmentId)
          : undefined,
      onChangeModel:
        kind === "user"
          ? (modelName: ConversationModelName) => nodeActionRefs.current?.updateNodeModel(nodeId, modelName)
          : undefined,
      onChangePromptMode:
        kind === "user"
          ? (promptMode: ConversationPromptMode) => nodeActionRefs.current?.updatePromptMode(nodeId, promptMode)
          : undefined,
      onToggleTool:
        kind === "user" ? (tool: ConversationToolName) => nodeActionRefs.current?.toggleNodeTool(nodeId, tool) : undefined,
      onClearPromptMode:
        kind === "user" ? () => nodeActionRefs.current?.updatePromptMode(nodeId, "auto") : undefined,
      onUserContentChange:
        kind === "user" || kind === "note"
          ? (nextValue: string) => nodeActionRefs.current?.updateUserNodeContent(nodeId, nextValue)
          : undefined,
      onResizeNode: (nextBounds) => nodeActionRefs.current?.resizeNode(nodeId, nextBounds),
      onStartEdit:
        kind === "user" || kind === "note" ? () => nodeActionRefs.current?.setEditingNodeId(nodeId) : undefined,
      onStopEdit:
        kind === "user" || kind === "note" ? () => nodeActionRefs.current?.setEditingNodeId(null) : undefined,
      onGenerateAiReply:
        kind === "user"
          ? () => {
            const latest = nodesRef.current.find((entry) => entry.id === nodeId);
            if (!latest) return;
            if (latest.data.promptMode === "deep-research") {
              markDeepResearchUnavailable(nodeId);
              return;
            }
            if (latest.data.promptMode === "image-create") {
              void nodeActionRefs.current?.runImageGenerationForUserNode(latest);
              return;
            }
            if (latest.data.promptMode === "code") {
              void nodeActionRefs.current?.runCodeGenerationForUserNode(latest);
              return;
            }
            void nodeActionRefs.current?.runAiGenerationForUserNode(latest);
          }
          : undefined,
      onRegenerateAi: kind === "ai" ? () => void nodeActionRefs.current?.regenerateAiNode(nodeId) : undefined,
      onRegenerateCode: kind === "code" ? () => void nodeActionRefs.current?.regenerateCodeNode(nodeId) : undefined,
      onRegenerateResult: kind === "result" ? () => void nodeActionRefs.current?.regenerateCodeNode(nodeId) : undefined,
      onRegenerateImage: kind === "image" ? () => void nodeActionRefs.current?.regenerateImageNode(nodeId) : undefined,
      onRunCode: kind === "code" ? () => void nodeActionRefs.current?.runCodeNode(nodeId) : undefined,
      onOpenDetail: (imageUrl?: string) => {
        if (imageUrl) {
          setPreviewImageUrl(imageUrl);
        } else {
          nodeActionRefs.current?.focusNode(nodeId, { preserveViewport: true });
        }
      },
    };

    nodeHandlerCacheRef.current.set(nodeId, handlers);
    return handlers;
  }, [markDeepResearchUnavailable, isMultiDragging]);

  const visibleNodes = useMemo<Array<Node<ConversationNodeData>>>(() => {
    const nextIds = new Set(nodes.map((node) => node.id));
    for (const id of nodeHandlerCacheRef.current.keys()) {
      if (!nextIds.has(id)) {
        nodeHandlerCacheRef.current.delete(id);
      }
    }
    for (const id of visibleNodeCacheRef.current.keys()) {
      if (!nextIds.has(id)) {
        visibleNodeCacheRef.current.delete(id);
      }
    }

    return nodes.map((node) => {
      const isEditing = editingNodeId === node.id;
      const isFocusMode = focusedNodeId !== null;
      const isFocused = focusedNodeId === node.id;
      const canNavigateFocus = isFocused;
      const className =
        focusedNodeId === null
          ? undefined
          : cn("mindmap-flow-node", isFocused ? "mindmap-flow-node--focused" : "mindmap-flow-node--dimmed");
      const cached = visibleNodeCacheRef.current.get(node.id);

      if (
        cached &&
        cached.sourceNode === node &&
        cached.isEditing === isEditing &&
        cached.isFocusMode === isFocusMode &&
        cached.isFocused === isFocused &&
        cached.canNavigateFocus === canNavigateFocus &&
        cached.className === className
      ) {
        return cached.node;
      }

      const nextNode: Node<ConversationNodeData> = {
        ...node,
        dragHandle: ".node-drag-handle",
        className,
        data: {
          ...node.data,
          ...getNodeHandlers(node.id, node.data.kind),
          isEditing,
          isFocusMode,
          isFocused,
          onNavigateFocus: canNavigateFocus ? navigateFocusedNode : undefined,
        },
      };

      visibleNodeCacheRef.current.set(node.id, {
        sourceNode: node,
        isEditing,
        isFocusMode,
        isFocused,
        canNavigateFocus,
        className,
        node: nextNode,
      });

      return nextNode;
    });
  }, [editingNodeId, focusedNodeId, getNodeHandlers, navigateFocusedNode, nodes]);

  const hasDraggingNode = useMemo(() => nodes.some((node) => Boolean(node.dragging)), [nodes]);

  const hasGeneratingNode = useMemo(() => nodes.some((node) => node.data.status === "generating"), [nodes]);
  // Never defer canvas rendering during dragging, as React Flow needs synchronous frame updates for smooth movement.
  const shouldDeferCanvasRender = hasGeneratingNode;
  const decoratedEdges = useMemo(
    () => {
      const activeEdgeIdSet = new Set(activeGenerationEdgeIds);
      return edges.map((edge) => {
        const isGenerationActive = activeEdgeIdSet.has(edge.id);
        return {
          ...edge,
          className: cn("mindmap-edge", isGenerationActive && "mindmap-edge--generating"),
          animated: isGenerationActive,
          style: {
            ...(edge.style ?? {}),
            stroke: isGenerationActive ? "#6b7280" : (edge.style?.stroke ?? "#9d9d9d"),
            strokeWidth: isGenerationActive ? 3.6 : (edge.style?.strokeWidth ?? 3.2),
            opacity: isGenerationActive ? 1 : (edge.style?.opacity ?? 1),
          },
        } satisfies Edge;
      });
    },
    [activeGenerationEdgeIds, edges],
  );
  const deferredVisibleNodes = useDeferredValue(visibleNodes);
  const deferredEdges = useDeferredValue(decoratedEdges);
  const flowNodes = shouldDeferCanvasRender ? deferredVisibleNodes : visibleNodes;
  const flowEdges = shouldDeferCanvasRender ? deferredEdges : decoratedEdges;
  const showHydrationIndicator = !isFreshCanvas && isHydratingCanvas && flowNodes.length === 0 && flowEdges.length === 0;
  const closeMenu = useCallback(() => setMenu(null), []);

  const onNodeDragStart = useCallback((_: ReactMouseEvent | MouseEvent, node: Node, nodes: Node[]) => {
    closeMenu();
    if (nodes.length > 1) {
      setIsMultiDragging(true);
    }
  }, [closeMenu]);

  const onNodeDragStop = useCallback(() => {
    setIsMultiDragging(false);
  }, []);
  const clearEditing = useCallback(() => setEditingNodeId(null), []);

  const handlePaneContextMenu = useCallback((event: MouseEvent | ReactMouseEvent<Element, MouseEvent>) => {
    if (shouldPreserveNativeContextMenu(event)) return;
    event.preventDefault();
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const wrapperPosition = toWrapperPosition(event.clientX, event.clientY, wrapper);
    setMenu({
      kind: "pane",
      flowPosition: reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      top: wrapperPosition.y,
      left: wrapperPosition.x,
    });
  }, [reactFlow]);

  const handleWrapperContextMenu = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (shouldPreserveNativeContextMenu(event)) return;
    const target = event.target;
    if (!(target instanceof Element) || !target.closest(".react-flow__pane")) return;
    handlePaneContextMenu(event);
  }, [handlePaneContextMenu]);

  const handlePaneFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      const position = pendingPaneUploadPositionRef.current;
      event.currentTarget.value = "";
      pendingPaneUploadPositionRef.current = null;
      if (!position || files.length === 0) return;
      await createFileNodesFromFiles(files, position);
      closeMenu();
    },
    [closeMenu, createFileNodesFromFiles],
  );

  const handleNodeContextMenu = useCallback((event: ReactMouseEvent<Element, MouseEvent>, node: Node<ConversationNodeData>) => {
    if (shouldPreserveNativeContextMenu(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const wrapperPosition = toWrapperPosition(event.clientX, event.clientY, wrapper);
    setMenu({ kind: "node", nodeId: node.id, top: wrapperPosition.y, left: wrapperPosition.x });
  }, []);

  const handleConnectStart = useCallback((_: unknown, params: OnConnectStartParams) => {
    connectSourceNodeIdRef.current = params.nodeId ?? null;
  }, []);

  const handleConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    setEdges((current) => {
      const exists = current.some(
        (edge) => edge.source === connection.source && edge.target === connection.target,
      );
      if (exists) return current;
      return addEdge(buildEdge(connection.source, connection.target), current).map(normalizeEdge);
    });
  }, [setEdges]);

  const handleReconnect = useCallback<OnReconnect<Edge>>((oldEdge, newConnection) => {
    if (!newConnection.source || !newConnection.target || newConnection.source === newConnection.target) return;

    setEdges((current) =>
      reconnectEdge(oldEdge, newConnection, current, { shouldReplaceId: false }).map((edge) => normalizeEdge(edge)),
    );
  }, [setEdges]);

  const handleConnectEnd = useCallback((event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
    const sourceNodeId = connectSourceNodeIdRef.current;
    connectSourceNodeIdRef.current = null;
    if (!sourceNodeId || connectionState.isValid || !(event instanceof MouseEvent)) return;
    const sourceNode = nodes.find((node) => node.id === sourceNodeId);
    if (!sourceNode || (sourceNode.data.kind !== "ai" && sourceNode.data.kind !== "image" && sourceNode.data.kind !== "file")) return;
    createEditableUserNode({
      position: reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      parentNodeId: sourceNodeId,
      anchor: "left-center",
    });
  }, [createEditableUserNode, nodes, reactFlow]);

  useEffect(() => {
    if (!isBrowserAuthReady) {
      return;
    }

    let cancelled = false;
    async function hydrate() {
      // Clear states that shouldn't persist across projects
      deletedNodeIdsRef.current = new Set();
      setMenu(null);
      setFocusedNodeId(null);
      setEditingNodeId(null);
      const cacheKey = getProjectCacheKey(currentProjectId);
      const freshCanvas = consumeFreshCanvasFlag(currentProjectId, userId);
      setIsFreshCanvas(freshCanvas);
      setIsHydratingCanvas(true);

      const memoryCached = projectSnapshotCacheRef.current.get(currentProjectId);
      const localCached = localStorage.getItem(cacheKey);
      const cachedSnapshot = memoryCached
        ? memoryCached
        : localCached
          ? (() => {
            try {
              const parsed = JSON.parse(localCached) as { nodes?: Array<Node<ConversationNodeRecord>>; edges?: Edge[] };
              return normalizeSnapshot(parsed);
            } catch {
              return null;
            }
          })()
          : null;
      if (freshCanvas && !memoryCached && !localCached) {
        setNodes([]);
        setEdges([]);
        hasHydratedCanvasRef.current = true;
        setIsHydratingCanvas(false);
        return;
      }

      if (memoryCached) {
        applySnapshotToCanvas(memoryCached);
      } else if (localCached) {
        try {
          const parsed = JSON.parse(localCached) as { nodes?: Array<Node<ConversationNodeRecord>>; edges?: Edge[] };
          const snapshot = normalizeSnapshot(parsed);
          projectSnapshotCacheRef.current.set(currentProjectId, snapshot);
          applySnapshotToCanvas(snapshot);
        } catch (cacheError) {
          console.warn("Failed to hydrate local canvas cache", cacheError);
        }
      }

      try {
        const response = await authFetch(`/api/canvas?projectId=${encodeURIComponent(currentProjectId)}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as { ok: boolean; snapshot?: { nodes: Array<Node<ConversationNodeRecord>>; edges: Edge[] } | null };
        
        if (!response.ok || !payload.ok || cancelled) return;

        if (!payload.snapshot) {
          projectSnapshotCacheRef.current.delete(currentProjectId);
          localStorage.removeItem(cacheKey);
          setIsFreshCanvas(true);
          return;
        }

        const snapshot = mergeSnapshotNodeSizes(normalizeSnapshot(payload.snapshot), cachedSnapshot);

        applySnapshotToCanvas(snapshot);
        storeSnapshotInCaches(currentProjectId, snapshot);
      } catch (err) {
        console.error("Hydration failed", err);
        if ((!memoryCached && !localCached) || cancelled) {
          return;
        }

        if (!memoryCached && localCached) {
          try {
            const parsed = JSON.parse(localCached) as { nodes?: Array<Node<ConversationNodeRecord>>; edges?: Edge[] };
            const snapshot = normalizeSnapshot(parsed);
            projectSnapshotCacheRef.current.set(currentProjectId, snapshot);
            applySnapshotToCanvas(snapshot);
          } catch (cacheError) {
            console.warn("Failed to recover local canvas cache", cacheError);
          }
        }
      } finally {
        if (!cancelled) {
          hasHydratedCanvasRef.current = true;
          setIsHydratingCanvas(false);
          setIsFreshCanvas(false);
        }
      }
    }
    void hydrate();

    // Safety timeout: Ensure the loader disappears after 10 seconds even if fetch hangs
    const safetyTimer = setTimeout(() => {
      if (!cancelled) setIsHydratingCanvas(false);
    }, 10000);

    return () => { 
      cancelled = true; 
      clearTimeout(safetyTimer);
    };
  }, [applySnapshotToCanvas, currentProjectId, getProjectCacheKey, isBrowserAuthReady, setEdges, storeSnapshotInCaches, userId]);

  useEffect(() => {
    const handlePasteGlobal = (event: ClipboardEvent) => {
      const clipboardData = event.clipboardData;
      if (!clipboardData) return;

      const clipboardFiles = Array.from(clipboardData.items)
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));

      // Handle image paste into prompt textarea
      if (
        event.target instanceof HTMLTextAreaElement &&
        event.target.closest(".mindmap-node-shell")
      ) {
        if (clipboardFiles.length > 0) {
          const nodeId = nodesRef.current.find(n => n.selected)?.id;
          if (nodeId) {
            event.preventDefault();
            void addNodeAttachments(nodeId, clipboardFiles);
          }
        }
        return;
      }

      if (
        event.target instanceof HTMLElement &&
        (event.target.closest("textarea") || event.target.closest("input") || event.target.isContentEditable)
      ) {
        return;
      }

      const centerPosition = mousePositionRef.current;
      if (clipboardFiles.length > 0) {
        event.preventDefault();
        void createFileNodesFromFiles(clipboardFiles, centerPosition);
        closeMenu();
        return;
      }

      const clipboardText = clipboardData.getData("text/plain");
      if (clipboardText) {
        event.preventDefault();
        const nextNodeId = crypto.randomUUID();
        const record: ConversationNodeRecord = {
          parentId: null,
          kind: "note",
          content: clipboardText,
          attachments: [],
          status: "idle",
          createdAt: timestampLabel(),
          isRoot: true,
          isPositionPinned: false,
        };
        const position = findAvailablePosition(centerPosition, getNodeDefaultSize("note"), nodesRef.current);
        const draftNode = buildNode(nextNodeId, position, record);
        setNodes((latest) => [...latest.map((node) => ({ ...node, selected: false })), { ...draftNode, position, selected: true }]);
        closeMenu();
      }
    };

    window.addEventListener("paste", handlePasteGlobal);
    return () => {
      window.removeEventListener("paste", handlePasteGlobal);
    };
  }, [closeMenu, createFileNodesFromFiles, reactFlow, setNodes, addNodeAttachments]);

  useEffect(() => {
    if (!isBrowserAuthReady) return;
    if (!hasHydratedCanvasRef.current || isHydratingCanvas || hasDraggingNode || hasGeneratingNode) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    const snapshot: CanvasSnapshotCacheEntry = {
      nodes: sanitizeNodesForPersistence(nodes),
      edges,
      updatedAt: Date.now(),
    };
    projectSnapshotCacheRef.current.set(currentProjectId, snapshot);
    localStorage.setItem(getProjectCacheKey(currentProjectId), JSON.stringify(snapshot));

    saveTimerRef.current = setTimeout(() => {
      void authFetch("/api/canvas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: currentProjectId, nodes, edges }),
      }).then((response) => {
        if (!response.ok) return;

        window.dispatchEvent(
          new CustomEvent("canvas:project-updated", {
            detail: {
              projectId: currentProjectId,
            },
          }),
        );
      });
    }, 450);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [currentProjectId, edges, getProjectCacheKey, hasDraggingNode, hasGeneratingNode, isBrowserAuthReady, isHydratingCanvas, nodes]);
  useEffect(() => {
    const handleCreateRoot = () => createRootNodeFromViewport();
    const handleFocusRequest = (event: Event) => {
      const customEvent = event as CustomEvent<{ nodeId?: string }>;
      if (customEvent.detail?.nodeId) focusNode(customEvent.detail.nodeId);
    };
    window.addEventListener("canvas:new-chat", handleCreateRoot);
    window.addEventListener("canvas:focus-node", handleFocusRequest as EventListener);
    return () => {
      window.removeEventListener("canvas:new-chat", handleCreateRoot);
      window.removeEventListener("canvas:focus-node", handleFocusRequest as EventListener);
    };
  }, [createRootNodeFromViewport, focusNode]);

  useEffect(() => {
    const updateModifierState = (event: KeyboardEvent) => {
      setIsRangeSelectionPressed(event.ctrlKey || event.metaKey);
    };

    const resetModifierState = () => {
      setIsRangeSelectionPressed(false);
    };

    window.addEventListener("keydown", updateModifierState);
    window.addEventListener("keyup", updateModifierState);
    window.addEventListener("blur", resetModifierState);

    return () => {
      window.removeEventListener("keydown", updateModifierState);
      window.removeEventListener("keyup", updateModifierState);
      window.removeEventListener("blur", resetModifierState);
    };
  }, []);

  const handleWrapperDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const files = Array.from(event.dataTransfer.files ?? []);
      if (files.length === 0) return;
      const position = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      await createFileNodesFromFiles(files, position);
      closeMenu();
    },
    [closeMenu, createFileNodesFromFiles, reactFlow],
  );

  const handleWrapperDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes("Files")) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handleWrapperMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    mousePositionRef.current = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
  }, [reactFlow]);

  const handleWrapperPasteCapture = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.closest("textarea") || target.closest("input") || target.isContentEditable)
      ) {
        return;
      }

      const clipboardFiles = Array.from(event.clipboardData?.items ?? [])
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));

      if (clipboardFiles.length === 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      void createFileNodesFromFiles(clipboardFiles, mousePositionRef.current);
      closeMenu();
    },
    [closeMenu, createFileNodesFromFiles],
  );

  return (
    <section className="canvas-shell" aria-label="Conversation canvas">

      <div
        className={cn("flow-wrapper", focusedNodeId !== null && "flow-wrapper--focus-mode")}
        ref={wrapperRef}
        onContextMenu={handleWrapperContextMenu}
        onDrop={handleWrapperDrop}
        onDragOver={handleWrapperDragOver}
        onMouseMove={handleWrapperMouseMove}
        onPasteCapture={handleWrapperPasteCapture}
      >
        <input
          ref={paneFileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,application/pdf"
          className="hidden"
          onChange={handlePaneFileChange}
        />
        {showHydrationIndicator ? (
            <div className="absolute left-6 top-6 z-50 flex items-center gap-3 rounded-full border border-neutral-200 bg-white/95 px-4 py-2 text-sm font-medium text-neutral-600 shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-top-4">
              <div className="size-2 animate-pulse rounded-full bg-indigo-500" />
             {CANVAS_COPY.syncIndicator}
            </div>
          ) : null}

        {hasGeneratingNode ? (
          <div className="absolute right-6 top-6 z-50 rounded-full border border-neutral-200 bg-white/95 px-3 py-1.5 text-sm text-neutral-600 shadow-sm backdrop-blur flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
            <div className="size-1.5 rounded-full bg-indigo-500 animate-pulse" />
            Generating...
          </div>
        ) : null}

        <ReactFlow<Node<ConversationNodeData>, Edge>
          style={{ width: "100%", height: "100%", backgroundColor: "transparent" }}
          nodes={flowNodes}
          edges={flowEdges}
          proOptions={{ hideAttribution: true }}
          nodeTypes={stableNodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeContextMenu={handleNodeContextMenu}
          onNodeClick={(_, node) => {
            closeMenu();
            if (focusedNodeId !== null && node.id !== focusedNodeId) {
              return;
            }
            if (editingNodeId && editingNodeId !== node.id) {
              clearEditing();
            }
          }}
          onEdgeClick={() => {
            closeMenu();
            clearEditing();
          }}
          onPaneClick={() => {
            closeMenu();
            clearEditing();
          }}
          onPaneContextMenu={handlePaneContextMenu}
          onMoveStart={closeMenu}
          onConnect={handleConnect}
          onReconnect={handleReconnect}
          onConnectStart={handleConnectStart}
          onConnectEnd={handleConnectEnd}
          onNodeDragStart={onNodeDragStart}
          onNodeDragStop={onNodeDragStop}
          defaultEdgeOptions={{
            type: "simplebezier",
            className: "mindmap-edge",
            selectable: true,
            focusable: true,
            reconnectable: false,
            animated: false,
            style: { stroke: "#8f949c", strokeWidth: 2.6, opacity: 0.95 },
          }}
          fitView={false}
          minZoom={0.2}
          maxZoom={2.6}
          deleteKeyCode={["Delete", "Backspace"]}
          selectionOnDrag={isRangeSelectionPressed}
          selectionKeyCode={null}
          multiSelectionKeyCode={["Shift"]}
          panOnDrag={isRangeSelectionPressed ? [1, 2] : [0, 1, 2]}
          panOnScroll={false}
          zoomOnScroll={true}
          zoomOnPinch
          zoomOnDoubleClick={false}
          nodesDraggable={focusedNodeId === null}
          nodesConnectable={focusedNodeId === null}
          edgesFocusable
          edgesReconnectable={false}
          connectOnClick={false}
          autoPanOnNodeFocus={false}
          elevateEdgesOnSelect
          connectionLineStyle={{ stroke: "#94a3b8", strokeWidth: 2.2, strokeDasharray: "4 6", strokeLinecap: "round" }}
        >
          <Panel position="top-right">
             <Button
               type="button"
               variant="outline"
               className="rounded-xl border-neutral-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur hover:bg-neutral-50 transition-all duration-200 group flex items-center gap-2"
               onClick={runAutoLayout}
               title="Auto layout nodes"
             >
               <LayoutDashboard className="size-4 text-neutral-600 group-hover:text-indigo-500 transition-colors" />
               <span className="text-xs font-medium text-neutral-600 mr-1">Auto Layout</span>
             </Button>
          </Panel>
          <Controls showInteractive={false} position="bottom-right" />
          <Background variant={BackgroundVariant.Dots} gap={24} size={2.7} color="rgba(71, 85, 105, 0.58)" />
        </ReactFlow>
        {menu ? (
          <div
            className="mindmap-context-menu"
            style={{ top: menu.top, left: menu.left }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {menu.kind === "pane" ? (
              <div className="mindmap-context-menu__section">
                <div className="mindmap-context-menu__label">Canvas</div>
                <button
                  className="mindmap-context-menu__item"
                  onClick={async () => {
                    const text = await navigator.clipboard.readText().catch(() => "");
                    if (text) {
                      const nextNodeId = crypto.randomUUID();
                      const record: ConversationNodeRecord = {
                        parentId: null,
                        kind: "note",
                        content: text,
                        attachments: [],
                        status: "idle",
                        createdAt: timestampLabel(),
                        isRoot: true,
                        isPositionPinned: false,
                      };
                      const position = findAvailablePosition(menu.flowPosition, getNodeDefaultSize("note"), nodesRef.current);
                      const draftNode = buildNode(nextNodeId, position, record);
                      setNodes((latest) => [...latest.map((n) => ({ ...n, selected: false })), { ...draftNode, position, selected: true }]);
                    }
                    closeMenu();
                  }}
                >
                  <div className="mindmap-context-menu__item-left">
                    <Clipboard className="size-3.5" />
                    <span>Paste</span>
                  </div>
                  <span className="mindmap-context-menu__shortcut">Ctrl+V</span>
                </button>
                <div className="mindmap-context-menu__divider" />
                <button
                  className="mindmap-context-menu__item"
                  onClick={() => {
                    createEditableUserNode({ position: menu.flowPosition, parentNodeId: null });
                    closeMenu();
                  }}
                >
                  <div className="mindmap-context-menu__item-left">
                    <MessageSquare className="size-3.5" />
                    <span>Add Chat</span>
                  </div>
                  <span className="mindmap-context-menu__shortcut">Prompt</span>
                </button>
                <button
                  className="mindmap-context-menu__item"
                  onClick={() => {
                    createEditableNoteNode({ position: menu.flowPosition, parentNodeId: null });
                    closeMenu();
                  }}
                >
                  <div className="mindmap-context-menu__item-left">
                    <StickyNote className="size-3.5" />
                    <span>Add Memo</span>
                  </div>
                  <span className="mindmap-context-menu__shortcut">Note</span>
                </button>
                <button
                  className="mindmap-context-menu__item"
                  onClick={() => {
                    pendingPaneUploadPositionRef.current = menu.flowPosition;
                    paneFileInputRef.current?.click();
                    closeMenu();
                  }}
                >
                  <div className="mindmap-context-menu__item-left">
                    <FileUp className="size-3.5" />
                    <span>Upload File</span>
                  </div>
                  <span className="mindmap-context-menu__shortcut">Ctrl+U</span>
                </button>
              </div>
            ) : (
              (() => {
                const targetNode = nodes.find((n) => n.id === menu.nodeId) ?? null;
                const canConvertToPrompt = targetNode?.data.kind === "note";
                const canConvertToNote = targetNode?.data.kind === "user";

                return (
                  <div className="mindmap-context-menu__section">
                    <div className="mindmap-context-menu__label">Node</div>
                    <button
                      className="mindmap-context-menu__item"
                      onClick={() => {
                        if (targetNode) {
                          void navigator.clipboard.writeText(targetNode.data.content);
                        }
                        closeMenu();
                      }}
                    >
                      <div className="mindmap-context-menu__item-left">
                        <Copy className="size-3.5" />
                        <span>Copy Content</span>
                      </div>
                      <span className="mindmap-context-menu__shortcut">Ctrl+C</span>
                    </button>
                    <button
                      className="mindmap-context-menu__item"
                      onClick={() => {
                        if (!targetNode) return;
                        const cloneRecord: ConversationNodeRecord = {
                          ...targetNode.data,
                          createdAt: timestampLabel(),
                          isRoot: false,
                          isPositionPinned: false,
                        };
                        const duplicateNode = buildNode(
                          crypto.randomUUID(),
                          findAvailablePosition(
                            { x: targetNode.position.x + 56, y: targetNode.position.y + 56 },
                            getNodeDefaultSize(targetNode.data.kind),
                            nodesRef.current,
                          ),
                          cloneRecord,
                        );
                        setNodes((latest) => [...latest.map((node) => ({ ...node, selected: false })), { ...duplicateNode, selected: true }]);
                        closeMenu();
                      }}
                    >
                      <div className="mindmap-context-menu__item-left">
                        <ClipboardCopy className="size-3.5" />
                        <span>Duplicate Node</span>
                      </div>
                      <span className="mindmap-context-menu__shortcut">Clone</span>
                    </button>
                    <div className="mindmap-context-menu__divider" />
                    <div className="mindmap-context-menu__label">Transform</div>
                    <button
                      className="mindmap-context-menu__item"
                      disabled={!canConvertToPrompt}
                      onClick={() => {
                        if (!canConvertToPrompt) return;
                        convertNodeKind(menu.nodeId, "user");
                        closeMenu();
                      }}
                    >
                      <div className="mindmap-context-menu__item-left">
                        <MessageCircleMore className="size-3.5" />
                        <span>Turn Into Prompt</span>
                      </div>
                      <span className="mindmap-context-menu__shortcut">AI</span>
                    </button>
                    <button
                      className="mindmap-context-menu__item"
                      disabled={!canConvertToNote}
                      onClick={() => {
                        if (!canConvertToNote) return;
                        convertNodeKind(menu.nodeId, "note");
                        closeMenu();
                      }}
                    >
                      <div className="mindmap-context-menu__item-left">
                        <FilePenLine className="size-3.5" />
                        <span>Turn Into Note</span>
                      </div>
                      <span className="mindmap-context-menu__shortcut">Memo</span>
                    </button>
                    <div className="mindmap-context-menu__divider" />
                    <button
                      className="mindmap-context-menu__item mindmap-context-menu__item--danger"
                      onClick={() => {
                        deleteNodesById([menu.nodeId]);
                        closeMenu();
                      }}
                    >
                      <div className="mindmap-context-menu__item-left">
                        <Trash2 className="size-3.5" />
                        <span>Delete</span>
                      </div>
                      <span className="mindmap-context-menu__shortcut">Del</span>
                    </button>
                  </div>
                );
              })()
            )}
          </div>
        ) : null}
        {previewImageUrl ? (
          <div
            className="mindmap-lightbox"
            onClick={() => setPreviewImageUrl(null)}
          >
            <div className="mindmap-lightbox__content animate-in zoom-in-95 duration-200">
              <MagicImage
                src={previewImageUrl || undefined}
                alt="Preview"
                className="mindmap-lightbox__image"
                imageClassName="object-contain"
              />
              <button className="mindmap-lightbox__close">
                <X className="size-6" />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function FlowCanvasComponent({ userId, initialProjectId }: { userId?: string; initialProjectId?: string }) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner userId={userId} initialProjectId={initialProjectId} />
    </ReactFlowProvider>
  );
}

export const FlowCanvas = memo(
  FlowCanvasComponent,
  (prevProps, nextProps) =>
    prevProps.userId === nextProps.userId && prevProps.initialProjectId === nextProps.initialProjectId,
);
