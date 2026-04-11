"use client";

import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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
  type OnNodeDrag,
  type XYPosition,
  useEdgesState,
  useReactFlow,
  useViewport,
} from "@xyflow/react";
import {
  MousePointer2,
  Clipboard,
  MessageSquare,
  StickyNote,
  FileUp,
  Copy,
  Trash2,
  FileEdit,
  X,
  LayoutDashboard
} from "lucide-react";
import { ConversationNode } from "@/components/conversation-node";
import { Button } from "@/components/ui/button";
import { buildLineageContext, type LineageEntry } from "@/lib/build-lineage-context";
import { getSuggestedChildPosition, layoutNodesForMindMap } from "@/lib/graph-layout";
import type {
  ConversationAttachment,
  ConversationImageModelName,
  ConversationModelName,
  ConversationNodeData,
  ConversationPromptMode,
  ConversationNodeRecord,
  ConversationTextModelName,
} from "@/lib/canvas-types";
import { getDefaultModelForPromptMode } from "@/lib/model-options";
import { getNodeDefaultSize } from "@/lib/node-layout";
import { cn } from "@/lib/utils";

type PaneMenu = { kind: "pane"; flowPosition: XYPosition; top: number; left: number };
type NodeMenu = { kind: "node"; nodeId: string; top: number; left: number };
type PlacementOptions = { width: number; height: number };
type NodeHandlerSet = Pick<
  ConversationNodeData,
  | "onAddAttachments"
  | "onRemoveAttachment"
  | "onChangeModel"
  | "onChangePromptMode"
  | "onClearPromptMode"
  | "onUserContentChange"
  | "onResizeNode"
  | "onStartEdit"
  | "onStopEdit"
  | "onGenerateAiReply"
  | "onRegenerateAi"
  | "onRegenerateImage"
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
type NodeActionRefs = {
  addNodeAttachments: (nodeId: string, files: File[]) => Promise<void>;
  removeNodeAttachment: (nodeId: string, attachmentId: string) => void;
  updateNodeModel: (nodeId: string, modelName: ConversationModelName) => void;
  updatePromptMode: (nodeId: string, promptMode: ConversationPromptMode) => void;
  updateUserNodeContent: (nodeId: string, nextValue: string) => void;
  resizeNode: (nodeId: string, nextBounds: { width: number; height: number; x: number; y: number }) => void;
  setEditingNodeId: (nodeId: string | null) => void;
  runAiGenerationForUserNode: (parentNode: Node<ConversationNodeRecord>, preferredPosition?: XYPosition) => Promise<void>;
  runImageGenerationForUserNode: (parentNode: Node<ConversationNodeRecord>) => Promise<void>;
  regenerateAiNode: (nodeId: string) => Promise<void>;
  regenerateImageNode: (nodeId: string) => Promise<void>;
  focusNode: (nodeId: string, options?: { preserveViewport?: boolean }) => void;
};

const nodeTypes: NodeTypes = { conversation: ConversationNode };
const MIN_HORIZONTAL_GAP = 72;
const MIN_VERTICAL_GAP = 80;
const OVERLAP_GAP = 40;
const GEMINI_TEXT_MODEL_NAME: ConversationModelName = "gemini-3.1-pro-preview";
const GEMINI_IMAGE_MODEL_NAME: ConversationModelName = "gemini-3-pro-image-preview";
const PERSIST_CACHE_PREFIX = "canvas-cache-v1:";
const DEFAULT_PROJECT_ID = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID ?? "canvasai-mvp";
const FILE_NODE_UPLOAD_ERROR = "ファイルの読み込みに失敗しました。";
const easeOutQuint = (t: number) => 1 - (1 - t) ** 5;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);

const timestampLabel = () =>
  new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

const revokeAttachmentPreviewUrls = (attachments: ConversationAttachment[]) => {
  attachments.forEach((attachment) => {
    if (attachment.previewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
  });
};

const sanitizeAttachmentsForPersistence = (attachments: ConversationAttachment[]): ConversationAttachment[] =>
  attachments.map(({ previewUrl: _previewUrl, ...attachment }) => attachment);

const sanitizeNodesForPersistence = (nodes: Array<Node<ConversationNodeRecord>>) =>
  nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      attachments: sanitizeAttachmentsForPersistence(node.data.attachments),
    },
  }));

const isSupportedTextModelName = (value: string | undefined): value is ConversationTextModelName =>
  value === "gemini-3.1-pro-preview" ||
  value === "gemini-3.1-pro" ||
  value === "gemini-3.1-flash" ||
  value === "gemini-3-flash-preview" ||
  value === "gemini-3.1-flash-lite-preview" ||
  value === "gemini-2.5-flash" ||
  value === "gemini-2.5-flash-lite" ||
  value === "gemini-2.5-pro";

const isSupportedImageModelName = (value: string | undefined): value is ConversationImageModelName =>
  value === "gemini-3-pro-image-preview" ||
  value === "gemini-2.5-flash-image" ||
  value === "imagen-4.0-generate-001";

const getActiveImageModel = (name: string | undefined): ConversationImageModelName => {
  if (isSupportedImageModelName(name)) return name;
  return GEMINI_IMAGE_MODEL_NAME;
};

const getActiveTextModel = (name: string | undefined): ConversationTextModelName => {
  if (isSupportedTextModelName(name)) return name;
  return GEMINI_TEXT_MODEL_NAME;
};

async function requestGeminiText(requestPayload: {
  targetNodeId: string;
  lineage: LineageEntry[];
  model: { provider: "gemini"; name: string };
  projectId?: string;
  promptMode?: ConversationPromptMode;
  onTextDelta?: (text: string) => void;
}): Promise<{ ok: true; model: string; text: string; tokenCount?: number | null; webSearchUsed?: boolean | null }> {
  const consumeSseEvents = (source: string) => {
    const events = source.split(/\r?\n\r?\n/);
    const remainder = events.pop() ?? "";
    return { events, remainder };
  };

  try {
    const response = await fetch("/api/gemini/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetNodeId: requestPayload.targetNodeId,
        lineage: requestPayload.lineage,
        model: requestPayload.model,
        projectId: requestPayload.projectId,
        promptMode: requestPayload.promptMode,
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new Error(payload?.error?.message ?? "Gemini のリクエストに失敗しました。");
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
      throw new Error("Gemini のストリームが途中で壊れました。");
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
    const response = await fetch("/api/gemini/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestPayload),
    });
    const payload = (await response.json()) as
      | { ok: true; model: string; attachments: ConversationAttachment[]; tokenCount?: number | null }
      | { ok: false; error?: { message?: string } };

    if (!response.ok || !payload.ok) {
      throw new Error(payload.ok ? "Gemini の画像生成に失敗しました。" : payload.error?.message ?? "Gemini の画像生成に失敗しました。");
    }

    return payload;
  } finally {
    window.dispatchEvent(new CustomEvent("credits:refresh"));
  }
}

async function uploadFiles(files: File[], projectId?: string) {
  const uploaded = [];
  for (const file of files) {
    const formData = new FormData();
    formData.append("file", file);
    if (projectId) {
      formData.append("projectId", projectId);
    }
    const response = await fetch("/api/attachments/file", { method: "POST", body: formData });
    const payload = (await response.json()) as
      | { ok: true; attachment: ConversationNodeRecord["attachments"][number] }
      | { ok: false; error?: { message?: string } };
    if (!response.ok || !payload.ok) {
      throw new Error(payload.ok ? "添付ファイルの追加に失敗しました。" : payload.error?.message ?? "添付ファイルの追加に失敗しました。");
    }
    uploaded.push(payload.attachment);
  }
  return uploaded;
}

async function uploadSingleFile(file: File, projectId?: string) {
  const uploaded = await uploadFiles([file], projectId);
  return uploaded[0];
}

const getNodeSize = (kind: ConversationNodeRecord["kind"]): PlacementOptions => {
  return getNodeDefaultSize(kind);
};

const buildNode = (id: string, position: XYPosition, record: ConversationNodeRecord): Node<ConversationNodeRecord> => {
  const size = getNodeSize(record.kind);
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
  selectable: true,
  focusable: true,
  reconnectable: false,
  animated: false,
  style: { stroke: "#9d9d9d", strokeWidth: 3.2, opacity: 1 },
});

const normalizeNode = (node: Node<ConversationNodeRecord>) => {
  const size = getNodeSize(node.data.kind);
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
  for (let attempt = 0; attempt < 36; attempt += 1) {
    const candidate = { x: desired.x + Math.floor(attempt / 6) * 84, y: desired.y + (attempt % 6) * MIN_VERTICAL_GAP };
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

function FlowCanvasInner() {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const paneFileInputRef = useRef<HTMLInputElement | null>(null);
  const [nodes, setNodes] = useState<Array<Node<ConversationNodeRecord>>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [menu, setMenu] = useState<PaneMenu | NodeMenu | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [isHydratingCanvas, setIsHydratingCanvas] = useState(true);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [isRangeSelectionPressed, setIsRangeSelectionPressed] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState(DEFAULT_PROJECT_ID);
  const reactFlow = useReactFlow<Node<ConversationNodeData>, Edge>();
  const viewport = useViewport();
  const screenToFlowPosition = reactFlow.screenToFlowPosition;
  const hasHydratedCanvasRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectSourceNodeIdRef = useRef<string | null>(null);
  const pendingPaneUploadPositionRef = useRef<XYPosition | null>(null);
  const nodesRef = useRef<Array<Node<ConversationNodeRecord>>>([]);
  const edgesRef = useRef<Edge[]>([]);
  const deletedNodeIdsRef = useRef<Set<string>>(new Set());
  const focusedNodeIdRef = useRef<string | null>(null);
  const focusRestoreViewportRef = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const streamedTextRef = useRef<Record<string, string>>({});
  const streamedTextFrameRef = useRef<number | null>(null);
  const nodeHandlerCacheRef = useRef<Map<string, NodeHandlerSet>>(new Map());
  const visibleNodeCacheRef = useRef<Map<string, VisibleNodeCacheEntry>>(new Map());
  const mousePositionRef = useRef<XYPosition>({ x: 0, y: 0 });
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [isMultiDragging, setIsMultiDragging] = useState(false);
  const nodeActionRefs = useRef<NodeActionRefs | null>(null);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    focusedNodeIdRef.current = focusedNodeId;
  }, [focusedNodeId]);

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
  }, [copySelected, nodes]);

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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if user is typing in a textarea or input
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
      } else if (event.key === "Delete" || event.key === "Backspace") {
        // Option to handle manual deletion if needed, 
        // but ReactFlow standard deletion via onNodesChange is usually enough.
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [copySelected, cutSelected, paste]);

  const scheduleStreamedNodeContentUpdate = useCallback((nodeId: string, text: string) => {
    streamedTextRef.current[nodeId] = text;

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
            const pendingText = pendingUpdates.get(node.id);
            if (pendingText === undefined) {
              return node;
            }

            return {
              ...node,
              data: {
                ...node.data,
                content: pendingText,
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
              content: `${entry.data.content}\n\nDeep Research はまだ通常送信に接続していません。明示モードだけ先に用意しています。`,
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
        if (editingNodeId && ids.has(editingNodeId)) setEditingNodeId(null);
        if (focusedNodeId && ids.has(focusedNodeId)) setFocusedNodeId(null);
        setEdges((currentEdges) => currentEdges.filter((edge) => !ids.has(edge.source) && !ids.has(edge.target)).map(normalizeEdge));
        return current.filter((node) => !ids.has(node.id));
      });
    },
    [editingNodeId, focusedNodeId, setEdges],
  );

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
        options: { nodeWidth: nextWidth, nodeHeight: nextHeight, rankSep: 108, nodeSep: 72 },
      });
      const parentWidth = Number(parentNode.style?.width ?? getNodeSize(parentNode.data.kind).width);
      const minimumX = parentNode.position.x + parentWidth + MIN_HORIZONTAL_GAP;
      if (preferredPosition) {
        return findAvailablePosition({ x: Math.max(preferredPosition.x, minimumX), y: preferredPosition.y }, { width: nextWidth, height: nextHeight }, currentNodes);
      }
      return findAvailablePosition(
        { x: Math.max(minimumX, suggested.x), y: siblingCount === 0 ? parentNode.position.y : parentNode.position.y + siblingCount * MIN_VERTICAL_GAP },
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
      const verticalPadding = 20;
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
              modelConfig: {
                provider: "gemini",
                name: getDefaultModelForPromptMode(promptMode),
              },
            },
          }
          : node,
      ),
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
        options: { nodeWidth: getNodeDefaultSize("ai").width, nodeHeight: getNodeDefaultSize("ai").height, rankSep: 60, nodeSep: 40 },
      }).map((node) => ({ ...node, selected: false })),
    );
    requestAnimationFrame(() => {
      void reactFlow.fitView({ padding: 0.18, duration: 320 });
    });
  }, [edges, reactFlow]);

  const buildPromptRequestLineage = useCallback(
    (targetNodeId: string, currentNodes: Array<Node<ConversationNodeRecord>>, currentEdges: Edge[]) => {
      const lineage = buildLineageContext(currentNodes, targetNodeId);
      const incomingContext = currentEdges
        .filter((edge) => edge.target === targetNodeId)
        .map((edge) => currentNodes.find((node) => node.id === edge.source))
        .filter((node): node is Node<ConversationNodeRecord> => Boolean(node))
        .filter((node) => node.id !== targetNodeId);

      if (incomingContext.length === 0) {
        return lineage;
      }

      const existingIds = new Set(lineage.map((entry) => entry.id));
      const extraEntries = incomingContext
        .filter((node) => !existingIds.has(node.id))
        .map((node) => ({
          id: node.id,
          parentId: node.data.parentId,
          kind: node.data.kind,
          content: node.data.content,
          attachments: node.data.attachments,
          status: node.data.status,
          createdAt: node.data.createdAt,
        }));

      return [...extraEntries, ...lineage];
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
      const lineage = buildPromptRequestLineage(latestParentNode.id, latestNodes, latestEdges);
      const nextNodeId = crypto.randomUUID();
      deletedNodeIdsRef.current.delete(nextNodeId);
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

      try {
        const result = await requestGeminiText({
          targetNodeId: latestParentNode.id,
          lineage,
          model: { provider: "gemini", name: activeModelName },
          projectId: currentProjectId,
          promptMode: latestParentNode.data.promptMode ?? "auto",
          onTextDelta: (text) => {
            if (deletedNodeIdsRef.current.has(nextNodeId)) {
              return;
            }
            scheduleStreamedNodeContentUpdate(nextNodeId, text);
          },
        });
        if (deletedNodeIdsRef.current.has(nextNodeId)) {
          return;
        }
        setNodes((latest) =>
          latest.map((node) =>
            node.id === nextNodeId
              ? {
                ...node,
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
        const message = error instanceof Error ? error.message : "Gemini のリクエストに失敗しました。";
        if (deletedNodeIdsRef.current.has(nextNodeId)) {
          return;
        }
        setNodes((latest) =>
          latest.map((node) =>
            node.id === nextNodeId
              ? {
                ...node,
                data: {
                  ...node.data,
                  content: `生成に失敗しました。\n\n${message}`,
                  status: "error",
                },
              }
              : node,
          ),
        );
      }
    },
    [buildPromptRequestLineage, currentProjectId, getInsertedChildPosition, scheduleStreamedNodeContentUpdate, setEdges],
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

      try {
        const lineage = buildPromptRequestLineage(latestParentNode.id, latestNodes, latestEdges);
        const result = await requestGeminiImage({
          prompt,
          attachments: latestParentNode.data.attachments,
          lineage,
          modelName: activeImageModelName,
          projectId: currentProjectId,
        });
        if (deletedNodeIdsRef.current.has(nextNodeId)) {
          return;
        }

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
        const message = error instanceof Error ? error.message : "Gemini の画像生成に失敗しました。";
        if (deletedNodeIdsRef.current.has(nextNodeId)) {
          return;
        }
        setNodes((latest) =>
          latest.map((node) =>
            node.id === nextNodeId
              ? {
                ...node,
                data: {
                  ...node.data,
                  content: `${prompt}\n\n画像生成に失敗しました。\n${message}`,
                  status: "error",
                },
              }
              : node,
          ),
        );
      }
    },
    [buildPromptRequestLineage, currentProjectId, getInsertedChildPosition, setEdges],
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
        modelConfig: kind === "user" ? { provider: "gemini", name: GEMINI_TEXT_MODEL_NAME } : undefined,
        promptMode: kind === "user" ? "auto" : undefined,
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
    [getInsertedChildPosition, setEdges],
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
    const lineage = buildPromptRequestLineage(targetNode.data.parentId, latestNodes, latestEdges);
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
        onTextDelta: (text) => {
          if (deletedNodeIdsRef.current.has(nodeId)) {
            return;
          }
          scheduleStreamedNodeContentUpdate(nodeId, text);
        },
      });
      if (deletedNodeIdsRef.current.has(nodeId)) {
        return;
      }
      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId
            ? {
              ...node,
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
      const message = error instanceof Error ? error.message : "Gemini のリクエストに失敗しました。";
      if (deletedNodeIdsRef.current.has(nodeId)) {
        return;
      }
      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId
            ? {
              ...node,
              data: {
                ...node.data,
                content: `再生成に失敗しました。\n\n${message}`,
                status: "error",
                createdAt: timestampLabel(),
              },
            }
            : node,
        ),
      );
    }
  }, [buildPromptRequestLineage, currentProjectId, scheduleStreamedNodeContentUpdate]);

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

      try {
        const lineage = buildPromptRequestLineage(parentNode.id, latestNodes, latestEdges);
        const result = await requestGeminiImage({
          prompt,
          attachments: parentNode.data.attachments,
          lineage,
          modelName: activeImageModelName,
          projectId: currentProjectId,
        });
        if (deletedNodeIdsRef.current.has(nodeId)) {
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
        const message = error instanceof Error ? error.message : "Gemini の画像生成に失敗しました。";
        if (deletedNodeIdsRef.current.has(nodeId)) {
          return;
        }
        setNodes((current) =>
          current.map((node) =>
            node.id === nodeId
              ? {
                ...node,
                data: {
                  ...node.data,
                  content: `${prompt}\n\n画像生成に失敗しました。\n${message}`,
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
    [buildPromptRequestLineage, currentProjectId],
  );

  useEffect(() => {
    nodeActionRefs.current = {
      addNodeAttachments,
      removeNodeAttachment,
      updateNodeModel,
      updatePromptMode,
      updateUserNodeContent,
      resizeNode,
      setEditingNodeId,
      runAiGenerationForUserNode,
      runImageGenerationForUserNode,
      regenerateAiNode,
      regenerateImageNode,
      focusNode,
    };
  }, [
    addNodeAttachments,
    focusNode,
    regenerateAiNode,
    regenerateImageNode,
    removeNodeAttachment,
    resizeNode,
    runAiGenerationForUserNode,
    runImageGenerationForUserNode,
    updateNodeModel,
    updatePromptMode,
    updateUserNodeContent,
  ]);

  const getNodeHandlers = useCallback((nodeId: string, kind: ConversationNodeRecord["kind"]): NodeHandlerSet => {
    const cached = nodeHandlerCacheRef.current.get(nodeId);
    if (cached) {
      return cached;
    }

    const handlers: NodeHandlerSet = {
      isMultiDragging,
      onAddAttachments:
        kind === "user" ? (files: File[]) => void nodeActionRefs.current?.addNodeAttachments(nodeId, files) : undefined,
      onRemoveAttachment:
        kind === "user"
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
            void nodeActionRefs.current?.runAiGenerationForUserNode(latest);
          }
          : undefined,
      onRegenerateAi: kind === "ai" ? () => void nodeActionRefs.current?.regenerateAiNode(nodeId) : undefined,
      onRegenerateImage: kind === "image" ? () => void nodeActionRefs.current?.regenerateImageNode(nodeId) : undefined,
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
  const shouldDeferCanvasRender = hasGeneratingNode || hasDraggingNode;
  const deferredVisibleNodes = useDeferredValue(visibleNodes);
  const deferredEdges = useDeferredValue(edges);
  const flowNodes = shouldDeferCanvasRender ? deferredVisibleNodes : visibleNodes;
  const flowEdges = shouldDeferCanvasRender ? deferredEdges : edges;
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
  const resetFocus = useCallback(() => {
    if (!focusedNodeIdRef.current) {
      return;
    }

    setFocusedNodeId(null);

    const restoreViewport = focusRestoreViewportRef.current;
    focusRestoreViewportRef.current = null;

    requestAnimationFrame(() => {
      if (restoreViewport) {
        void reactFlow.setViewport(restoreViewport, {
          duration: 420,
          ease: easeOutQuint,
          interpolate: "smooth",
        });
        return;
      }

      void reactFlow.fitView({
        padding: 0.18,
        duration: 420,
        ease: easeOutQuint,
        interpolate: "smooth",
      });
    });
  }, [reactFlow]);
  const clearEditing = useCallback(() => setEditingNodeId(null), []);

  const handlePaneContextMenu = useCallback((event: MouseEvent | ReactMouseEvent<Element, MouseEvent>) => {
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

  const handleNodeDragStop = useCallback<OnNodeDrag<Node<ConversationNodeData>>>((_, draggedNode) => {
    setNodes((current) =>
      current.map((node) =>
        node.id === draggedNode.id ? { ...node, position: draggedNode.position, data: { ...node.data, isPositionPinned: true } } : node,
      ),
    );
  }, []);

  const handleNodeContextMenu = useCallback((event: ReactMouseEvent<Element, MouseEvent>, node: Node<ConversationNodeData>) => {
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
    let cancelled = false;
    async function hydrate() {
      // Clear states that shouldn't persist across projects
      deletedNodeIdsRef.current = new Set();
      setMenu(null);
      setFocusedNodeId(null);
      setEditingNodeId(null);

      const cacheKey = `${PERSIST_CACHE_PREFIX}${currentProjectId}`;
      const localCached = localStorage.getItem(cacheKey);
      let initialNodesSet = false;

      if (localCached) {
        try {
          const parsed = JSON.parse(localCached);
          if (parsed && Array.from(parsed.nodes || []).length > 0) {
            const cachedNodes = sanitizeNodesForPersistence(parsed.nodes || []);
            setNodes(cachedNodes.map((node: Node<ConversationNodeRecord>) => normalizeNode({ ...node, selected: false })));
            setEdges((parsed.edges || []).map(normalizeEdge));
            // Fast path: Hide the main loader immediately if we have cached data to show
            setIsHydratingCanvas(false);
            initialNodesSet = true;
          }
        } catch (e) {
          console.warn("Failed to parse local canvas cache", e);
        }
      }

      // If no cache, we MUST show the loader while we fetch the first time
      if (!initialNodesSet) {
        setIsHydratingCanvas(true);
      }

      try {
        const response = await fetch(`/api/canvas?projectId=${encodeURIComponent(currentProjectId)}`);
        const payload = (await response.json()) as { ok: boolean; snapshot?: { nodes: Array<Node<ConversationNodeRecord>>; edges: Edge[] } | null };
        
        if (!response.ok || !payload.ok || cancelled) return;

        if (!payload.snapshot) {
          if (!initialNodesSet) {
            setNodes([]);
            setEdges([]);
          }
          return;
        }

        const freshNodes = sanitizeNodesForPersistence(payload.snapshot.nodes).map((node) => normalizeNode({ ...node, selected: false }));
        const freshEdges = payload.snapshot.edges.map(normalizeEdge);

        // Update the state with fresh data from server
        setNodes(freshNodes);
        setEdges(freshEdges);

        // Update cache for next time
        localStorage.setItem(cacheKey, JSON.stringify({ nodes: sanitizeNodesForPersistence(freshNodes), edges: freshEdges, updatedAt: Date.now() }));
      } catch (err) {
        console.error("Hydration failed", err);
      } finally {
        if (!cancelled) {
          hasHydratedCanvasRef.current = true;
          setIsHydratingCanvas(false);
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
  }, [currentProjectId, setEdges]);

  const handleWrapperPaste = useCallback(
    async (event: React.ClipboardEvent<HTMLDivElement>) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.closest("textarea") || target.closest("input") || target.isContentEditable)
      ) {
        return;
      }

      const clipboardData = event.clipboardData;
      const clipboardFiles = Array.from(clipboardData.items)
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));

      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      const centerPosition = reactFlow.screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });

      if (clipboardFiles.length > 0) {
        event.preventDefault();
        await createFileNodesFromFiles(clipboardFiles, centerPosition);
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
    },
    [closeMenu, createFileNodesFromFiles, reactFlow, setNodes],
  );

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
    if (!hasHydratedCanvasRef.current || isHydratingCanvas || hasDraggingNode || hasGeneratingNode) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    const cacheKey = `${PERSIST_CACHE_PREFIX}${currentProjectId}`;
    localStorage.setItem(cacheKey, JSON.stringify({ nodes: sanitizeNodesForPersistence(nodes), edges, updatedAt: Date.now() }));

    saveTimerRef.current = setTimeout(() => {
      const currentTitle =
        nodes.find((node) => node.data.isRoot)?.data.content.trim() ||
        nodes.find((node) => node.data.kind === "user")?.data.content.trim() ||
        "Untitled canvas";

      void fetch("/api/canvas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: currentProjectId, nodes, edges }),
      }).then((response) => {
        if (!response.ok) return;

        window.dispatchEvent(
          new CustomEvent("canvas:project-updated", {
            detail: {
              projectId: currentProjectId,
              title: currentTitle,
            },
          }),
        );
      });
    }, 450);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [currentProjectId, edges, hasDraggingNode, hasGeneratingNode, isHydratingCanvas, nodes]);
  useEffect(() => {
    const handleSwitchCanvas = (event: Event) => {
      const customEvent = event as CustomEvent<{ canvasId?: string }>;
      const canvasId = customEvent.detail?.canvasId;
      if (canvasId) {
        setCurrentProjectId((prev) => {
          if (prev !== canvasId) {
            hasHydratedCanvasRef.current = false;
            setIsHydratingCanvas(true);
            return canvasId;
          }
          return prev;
        });
      }
    };

    const handleCreateRoot = () => createRootNodeFromViewport();
    const handleFocusRequest = (event: Event) => {
      const customEvent = event as CustomEvent<{ nodeId?: string }>;
      if (customEvent.detail?.nodeId) focusNode(customEvent.detail.nodeId);
    };
    window.addEventListener("canvas:new-chat", handleCreateRoot);
    window.addEventListener("canvas:focus-node", handleFocusRequest as EventListener);
    window.addEventListener("canvas:switch-canvas", handleSwitchCanvas as EventListener);
    return () => {
      window.removeEventListener("canvas:new-chat", handleCreateRoot);
      window.removeEventListener("canvas:focus-node", handleFocusRequest as EventListener);
      window.removeEventListener("canvas:switch-canvas", handleSwitchCanvas as EventListener);
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

  return (
    <section className="canvas-shell" aria-label="Conversation canvas">

      <div
        className={cn("flow-wrapper", focusedNodeId !== null && "flow-wrapper--focus-mode")}
        ref={wrapperRef}
        onContextMenu={handleWrapperContextMenu}
        onDrop={handleWrapperDrop}
        onDragOver={handleWrapperDragOver}
        onMouseMove={handleWrapperMouseMove}
      >
        <input
          ref={paneFileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,application/pdf"
          className="hidden"
          onChange={handlePaneFileChange}
        />
        {isHydratingCanvas ? (
          <div className="absolute left-6 top-6 z-50 flex items-center gap-3 rounded-full border border-neutral-200 bg-white/95 px-4 py-2 text-sm font-medium text-neutral-600 shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-top-4">
            <div className="size-2 animate-pulse rounded-full bg-indigo-500" />
            Synchronizing with cloud...
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
          nodeTypes={nodeTypes}
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
            selectable: true,
            focusable: true,
            reconnectable: false,
            animated: false,
            style: { stroke: "#8f949c", strokeWidth: 2.6, opacity: 0.95 },
          }}
          fitView={!isHydratingCanvas && focusedNodeId === null}
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
          <Background variant={BackgroundVariant.Dots} gap={24} size={2.5} />
        </ReactFlow>
        {menu ? (
          <div
            className="mindmap-context-menu"
            style={{ top: menu.top, left: menu.left }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {menu.kind === "pane" ? (
              <div className="mindmap-context-menu__section">
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
                  <span className="mindmap-context-menu__shortcut">⌘V</span>
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
                  <span className="mindmap-context-menu__shortcut">⌘⇧U</span>
                </button>
              </div>
            ) : (
              <div className="mindmap-context-menu__section">
                <button
                  className="mindmap-context-menu__item"
                  onClick={() => {
                    const targetNode = nodes.find((n) => n.id === menu.nodeId);
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
                  <span className="mindmap-context-menu__shortcut">⌘C</span>
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
                  <span className="mindmap-context-menu__shortcut">⌫</span>
                </button>
              </div>
            )}
          </div>
        ) : null}
        {previewImageUrl ? (
          <div
            className="mindmap-lightbox"
            onClick={() => setPreviewImageUrl(null)}
          >
            <div className="mindmap-lightbox__content animate-in zoom-in-95 duration-200">
              <img src={previewImageUrl || undefined} alt="Preview" className="mindmap-lightbox__image" />
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

export function FlowCanvas() {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner />
    </ReactFlowProvider>
  );
}
