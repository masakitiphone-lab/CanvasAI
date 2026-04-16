"use client";

import { memo, useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent, type DragEvent as ReactDragEvent } from "react";
import { Handle, Position, useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUp,
  BarChart,
  Bot,
  Camera,
  ChevronDown,
  Clock,
  FileImage,
  FileText,
  Globe,
  ImagePlus,
  Link2,
  Braces,
  TerminalSquare,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  StickyNote,
  UserRound,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BorderBeam } from "@/components/ui/border-beam";
import { Button } from "@/components/ui/button";
import { MagicImage } from "@/components/ui/magic-image";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import type {
  ConversationAttachment,
  ConversationNodeData,
  ConversationPromptMode,
  ConversationToolName,
} from "@/lib/canvas-types";
import {
  IMAGE_MODEL_OPTIONS,
  normalizeModelName,
  TEXT_MODEL_OPTIONS,
} from "@/lib/model-options";
import { getNodeDefaultSize, getNodeMinSize } from "@/lib/node-layout";
import { cn } from "@/lib/utils";

type ResizeDirection =
  | "top"
  | "right"
  | "bottom"
  | "left"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

const promptModeMeta: Record<
  ConversationPromptMode,
  { label: string; icon: typeof Search; dismissible: boolean; description: string }
> = {
  auto: {
    label: "Auto",
    icon: Search,
    dismissible: false,
    description: "Conversation",
  },
  code: {
    label: "Code",
    icon: Braces,
    dismissible: true,
    description: "Run Python in browser",
  },
  "image-create": {
    label: "Create Image",
    icon: ImagePlus,
    dismissible: true,
    description: "Visual",
  },
  "deep-research": {
    label: "Deep Research",
    icon: Globe,
    dismissible: true,
    description: "Deep Dive",
  },
};

const PROMPT_MODES = Object.keys(promptModeMeta) as ConversationPromptMode[];
const TOOL_OPTIONS: Array<{
  value: ConversationToolName;
  label: string;
  description: string;
  icon: typeof Search;
}> = [
  { value: "google-search", label: "Search", description: "Google Search grounding", icon: Search },
  { value: "url-context", label: "URL", description: "Read linked web pages", icon: Link2 },
];

const resizeDirections: ResizeDirection[] = [
  "top",
  "right",
  "bottom",
  "left",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

const hiddenHandleStyle = {
  width: 8,
  height: 8,
  border: 0,
  background: "transparent",
  opacity: 0,
  pointerEvents: "none" as const,
};

const getAttachmentSrc = (attachment?: ConversationAttachment) => {
  if (!attachment) {
    return undefined;
  }

  if (attachment.id.startsWith("temp-")) {
    return attachment.previewUrl || attachment.url || undefined;
  }

  return attachment.url || attachment.previewUrl || undefined;
};

function LazyAttachmentImage({
  attachment,
  alt,
  className,
}: {
  attachment?: ConversationAttachment;
  alt: string;
  className: string;
}) {
  const src = getAttachmentSrc(attachment);
  const isTemporary = attachment?.id.startsWith("temp-") ?? false;

  return (
    <MagicImage
      src={src}
      alt={alt}
      className={cn("mindmap-lazy-asset", !isTemporary && "bg-transparent")}
      imageClassName={className}
      onDragStart={(event: ReactDragEvent) => event.preventDefault()}
    />
  );
}

const visibleHandleBaseStyle = {
  width: 18,
  height: 18,
  border: "2px solid #d4d4d4",
  background: "#ffffff",
  opacity: 1,
  pointerEvents: "auto" as const,
  zIndex: 30,
  top: "50%",
  bottom: "auto",
};

const targetHandleStyle = {
  ...visibleHandleBaseStyle,
  left: 0,
  right: "auto",
  transform: "translate(-50%, -50%)",
};

const sourceHandleStyle = {
  ...visibleHandleBaseStyle,
  left: "auto",
  right: 0,
  transform: "translate(50%, -50%)",
};

function deriveTitle(content: string, kind: ConversationNodeData["kind"]) {
  if (kind === "file") return "File";

  const trimmed = content.trim();
  if (!trimmed) {
    if (kind === "user") return "New prompt";
    if (kind === "image") return "Image generation";
    if (kind === "note") return "Memo";
    return "AI response";
  }

  const [firstLine] = trimmed.split("\n");
  return firstLine.slice(0, 52);
}

function attachmentIcon(kind: ConversationAttachment["kind"]) {
  if (kind === "image") return FileImage;
  if (kind === "pdf") return FileText;
  return Link2;
}

function formatTokenCount(tokenCount?: number) {
  if (!tokenCount || tokenCount <= 0) return null;
  return `${tokenCount.toLocaleString()} tokens`;
}

function computeResizedBounds(params: {
  direction: ResizeDirection;
  clientX: number;
  clientY: number;
  startRect: DOMRect;
  zoom: number;
  minWidth: number;
  minHeight: number;
  startX: number;
  startY: number;
}) {
  const { direction, clientX, clientY, startRect, zoom, minWidth, minHeight, startX, startY } = params;
  let width = startRect.width / zoom;
  let height = startRect.height / zoom;
  let x = startX;
  let y = startY;

  if (direction.includes("right")) {
    const nextRight = Math.max(clientX, startRect.left + minWidth * zoom);
    width = Math.max(minWidth, (nextRight - startRect.left) / zoom);
  }

  if (direction.includes("left")) {
    const nextLeft = Math.min(clientX, startRect.right - minWidth * zoom);
    width = Math.max(minWidth, (startRect.right - nextLeft) / zoom);
    x = startX + (nextLeft - startRect.left) / zoom;
  }

  if (direction.includes("bottom")) {
    const nextBottom = Math.max(clientY, startRect.top + minHeight * zoom);
    height = Math.max(minHeight, (nextBottom - startRect.top) / zoom);
  }

  if (direction.includes("top")) {
    const nextTop = Math.min(clientY, startRect.bottom - minHeight * zoom);
    height = Math.max(minHeight, (startRect.bottom - nextTop) / zoom);
    y = startY + (nextTop - startRect.top) / zoom;
  }

  return { width, height, x, y };
}

function areAttachmentsEqual(prevAttachments: ConversationAttachment[], nextAttachments: ConversationAttachment[]) {
  if (prevAttachments.length !== nextAttachments.length) return false;
  return prevAttachments.every((attachment, index) => {
    const nextAttachment = nextAttachments[index];
    return (
      attachment.id === nextAttachment.id &&
      attachment.name === nextAttachment.name &&
      attachment.url === nextAttachment.url &&
      attachment.kind === nextAttachment.kind
    );
  });
}

function ConversationNodeComponent({
  selected,
  data,
  width,
  height,
  positionAbsoluteX,
  positionAbsoluteY,
  dragging,
}: NodeProps<Node<ConversationNodeData>>) {
  const isDragging = !!dragging;
  const { getViewport } = useReactFlow();
  const isUser = data.kind === "user";
  const isAi = data.kind === "ai";
  const isCode = data.kind === "code";
  const isResult = data.kind === "result";
  const isImage = data.kind === "image";
  const isFile = data.kind === "file";
  const isNote = data.kind === "note";
  const isEditing = Boolean(data.isEditing);
  const title = deriveTitle(data.content, data.kind);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const footerControlsRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [openPanel, setOpenPanel] = useState<"mode" | "model" | "tools" | null>(null);
  const [resizePreview, setResizePreview] = useState<{ width: number; height: number; x: number; y: number } | null>(null);
  const imageAttachments = data.attachments.filter((attachment) => attachment.kind === "image");
  const otherAttachments = data.attachments.filter((attachment) => attachment.kind !== "image");
  const inlineImageAttachments = isResult ? imageAttachments : [];
  const footerAttachments = isUser ? data.attachments : isResult ? otherAttachments : otherAttachments;
  const activePromptMode = data.promptMode ?? "auto";
  const isCodePromptMode = activePromptMode === "code";
  const modelOptions = activePromptMode === "image-create" ? IMAGE_MODEL_OPTIONS : TEXT_MODEL_OPTIONS;
  const activeModel = normalizeModelName(data.modelConfig?.name, activePromptMode);
  const activeModelOption = modelOptions.find((option) => option.value === activeModel) ?? modelOptions[0];
  const activePromptModeMeta = promptModeMeta[activePromptMode];
  const ActivePromptModeIcon = activePromptModeMeta.icon;
  const enabledTools = data.enabledTools ?? [];
  const supportedTools: ConversationToolName[] =
    activePromptMode === "image-create"
      ? []
      : activePromptMode === "code"
        ? []
        : ["google-search", "url-context"];
  const supportedToolSet = new Set<ConversationToolName>(supportedTools);
  const nodeLabel = isUser ? "Prompt" : isCode ? "Code" : isResult ? "Result" : isImage ? "Image" : isFile ? "File" : isNote ? "Note" : "Response";
  const NodeLabelIcon = isUser ? UserRound : isCode ? Braces : isResult ? TerminalSquare : isImage ? Camera : isFile ? FileText : isNote ? StickyNote : Bot;
  const tokenCountLabel = formatTokenCount(data.tokenCount);
  const defaultSize = getNodeDefaultSize(data.kind);
  const minSize = getNodeMinSize(data.kind);
  const defaultWidth = defaultSize.width;
  const preferredHeight = defaultSize.height;
  const minWidth = minSize.width;
  const minHeight = minSize.height;
  const nodeWidth = Math.max(Number(resizePreview?.width ?? width ?? defaultWidth), minWidth);
  const nodeHeight = Math.max(Number(resizePreview?.height ?? height ?? preferredHeight), minHeight);
  const isTargetHandleVisible = isUser || isNote;
  const isSourceHandleVisible = isAi || isCode || isImage || isFile || isNote;

  useEffect(() => {
    if (!openPanel) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!footerControlsRef.current?.contains(target)) {
        setOpenPanel(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenPanel(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [openPanel]);

  const handleScrollAreaWheelCapture = () => {
    // Scroll navigation disabled as per user request
  };

  const handleTextareaWheelCapture = () => {
    // Scroll navigation disabled as per user request
  };

  const handleResizeStart = (direction: ResizeDirection, event: ReactPointerEvent<HTMLDivElement>) => {
    if (!data.onResizeNode) return;
    event.preventDefault();
    event.stopPropagation();
    const shell = shellRef.current;
    if (!shell) return;
    const pointerId = event.pointerId;
    const target = event.currentTarget;
    target.setPointerCapture(pointerId);
    const startRect = shell.getBoundingClientRect();
    const startX = positionAbsoluteX;
    const startY = positionAbsoluteY;
    const startWidth = startRect.width / getViewport().zoom;
    const startHeight = startRect.height / getViewport().zoom;
    let latestBounds = { width: startWidth, height: startHeight, x: startX, y: startY };

    const onPointerMove = (moveEvent: PointerEvent) => {
      const currentZoom = getViewport().zoom;

      latestBounds = computeResizedBounds({
        direction,
        clientX: moveEvent.clientX,
        clientY: moveEvent.clientY,
        startRect,
        zoom: currentZoom,
        minWidth,
        minHeight,
        startX,
        startY,
      });
      setResizePreview(latestBounds);
      data.onResizeNode?.(latestBounds);
    };

    const clearListeners = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
      setResizePreview(null);
    };

    const onPointerUp = () => {
      clearListeners();
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length > 0) {
      data.onAddAttachments?.(files);
    }
    event.currentTarget.value = "";
  };

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <Handle
        key="target-handle"
        type="target"
        position={Position.Left}
        className={cn("mindmap-handle", (isUser || isNote) ? "mindmap-handle--target-visible" : "mindmap-handle--target")}
        style={isTargetHandleVisible ? targetHandleStyle : hiddenHandleStyle}
      />

      <motion.div
        key="node-shell"
        initial={{ opacity: 0, scale: 0.9, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: -10 }}
        transition={{ type: "spring", damping: 20, stiffness: 300 }}
        className={cn(
          "mindmap-node-shell",
          isUser && "mindmap-node-shell--user",
          isAi && "mindmap-node-shell--ai",
          isCode && "mindmap-node-shell--code",
          isResult && "mindmap-node-shell--result",
          isImage && "mindmap-node-shell--image",
          isFile && "mindmap-node-shell--file",
          isNote && "mindmap-node-shell--note",
          data.status === "generating" && "mindmap-node-shell--generating",
          data.isRoot && "mindmap-node-shell--root",
          data.isFocusMode && "mindmap-node-shell--focus-mode",
          data.isFocused && "mindmap-node-shell--focus-current",
          selected && "mindmap-node-shell--selected",
          isDragging && "mindmap-node-shell--dragging"
        )}
        data-kind={data.kind}
        ref={shellRef}
        style={{ width: nodeWidth, height: nodeHeight }}
      >
        {data.status === "generating" && (
          <BorderBeam
            size={240}
            duration={3}
            delay={0}
            colorFrom="var(--node-ai)"
            colorTo="#818cf8"
            borderWidth={2.4}
          />
        )}
        <div className="mindmap-node-shell__outside-label">
          <NodeLabelIcon className="size-3" />
          <span>{nodeLabel}</span>
        </div>

        {resizeDirections.map((direction) => (
          <div
            key={direction}
            className={cn("mindmap-node-resize", `mindmap-node-resize--${direction}`)}
            onPointerDown={(event) => handleResizeStart(direction, event)}
          />
        ))}

        <div className="mindmap-node-shell__header node-drag-handle" onDoubleClick={() => data.onOpenDetail?.()}>
          <div className="mindmap-node-shell__header-row">
            <div className="mindmap-node-shell__meta">
              <h3 className="mindmap-node-shell__title">{title}</h3>
            </div>
            <div className="flex items-center gap-2">
              {data.isRoot ? (
                <Badge variant="outline" className="rounded-full border-neutral-200 bg-white/92 px-2 py-0.5 text-[10px] font-medium text-neutral-500 shadow-sm">
                  ROOT
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mindmap-node-shell__body">
          {isDragging && data.isMultiDragging ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-12 text-neutral-400">
              <Bot className="size-10 opacity-20 animate-pulse" />
              <div className="flex flex-col items-center gap-1">
                <span className="text-[13px] font-semibold tracking-tight opacity-50">Mass Moving</span>
                <span className="text-[10px] font-medium uppercase tracking-[0.1em] opacity-30">Performance Mode</span>
              </div>
            </div>
          ) : (
            <>
              {isFile ? (
                <div className="mindmap-file-node">
                  {data.attachments[0] ? (
                    data.attachments[0].kind === "image" ? (
                      <div className="mindmap-file-node__image-wrapper cursor-zoom-in group" onClick={() => data.onOpenDetail?.(getAttachmentSrc(data.attachments[0]))}>
                        <LazyAttachmentImage
                          attachment={data.attachments[0]}
                          alt={data.attachments[0].name}
                          className="mindmap-file-node__image"
                        />
                        <div className="mindmap-file-node__image-overlay">
                          <span className="truncate">{data.attachments[0].name}</span>
                        </div>
                      </div>
                    ) : (
                      <a href={data.attachments[0].url} target="_blank" rel="noreferrer" className="mindmap-file-node__card">
                        {(() => {
                          const Icon = attachmentIcon(data.attachments[0].kind);
                          return <Icon className="size-5 shrink-0" />;
                        })()}
                        <div className="mindmap-file-node__meta">
                          <strong>{data.attachments[0].name}</strong>
                          <span>{data.attachments[0].kind === "pdf" ? "PDF" : "File"}</span>
                        </div>
                      </a>
                    )
                  ) : (
                    <div className="mindmap-file-node__placeholder" aria-busy={data.status === "generating"}>
                      <div className="mindmap-file-node__meta">
                        <strong>{data.content || "Preparing file..."}</strong>
                        <span>{data.status === "error" ? "Upload failed" : "Uploading"}</span>
                      </div>
                      <div className="mindmap-file-node__progress" aria-hidden="true">
                        <div className="mindmap-file-node__progress-bar" />
                      </div>
                    </div>
                  )}
                </div>
              ) : isImage ? (
                <div className="mindmap-image-node">
                  {imageAttachments.length > 0 ? (
                    <div className="mindmap-image-node__hero node-drag-handle">
                      <div className="mindmap-image-node__canvas cursor-zoom-in" onClick={() => data.onOpenDetail?.(getAttachmentSrc(imageAttachments[0]))}>
                        <LazyAttachmentImage
                          attachment={imageAttachments[0]}
                          alt={data.content}
                          className="mindmap-image-node__image"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="mindmap-image-node__empty min-h-[160px] flex items-center justify-center bg-neutral-50/10 rounded-2xl border border-dashed border-neutral-100/50 overflow-hidden relative">
                      <div className="absolute inset-0 bg-linear-to-tr from-neutral-50/50 via-white to-neutral-50/50 animate-pulse" />
                    </div>
                  )}
                  {imageAttachments.length > 1 && (
                    <div className="mindmap-image-node__thumbs">
                      {imageAttachments.slice(1).map((att, i) => (
                        <div key={att.id || i} onClick={() => data.onOpenDetail?.(getAttachmentSrc(att))} className="mindmap-image-node__thumb cursor-zoom-in">
                          <LazyAttachmentImage
                            attachment={att}
                            alt={att.name}
                            className="mindmap-image-node__thumb-image"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mindmap-image-node__prompt" title={data.content}>
                    <p>{data.content}</p>
                  </div>
                </div>
              ) : (isUser || isNote) ? (
                <Textarea
                  value={data.content}
                  onChange={(e) => data.onUserContentChange?.(e.target.value)}
                  onWheelCapture={handleTextareaWheelCapture}
                  autoFocus={isEditing}
                  className="mindmap-node-shell__textarea nodrag nowheel resize-none rounded-[22px] border-neutral-200 bg-white text-[15px] leading-7 shadow-none focus-visible:ring-0 focus-visible:border-neutral-300 transition-all duration-200"
                  placeholder={isUser ? (isCodePromptMode ? "Write your Python code here" : "Write your prompt here") : "Write your memo here"}
                />
              ) : (
                <ScrollArea className="mindmap-node-shell__content nodrag nowheel rounded-[22px]" onWheelCapture={handleScrollAreaWheelCapture}>
                  {isAi || isCode || isResult ? (
                    <div className="mindmap-node-shell__content-inner">
                      {isResult && inlineImageAttachments.length > 0 ? (
                        <div className="mb-6 space-y-3">
                          <div className={cn("grid gap-3", inlineImageAttachments.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
                            {inlineImageAttachments.map((attachment) => (
                              <button
                                key={attachment.id}
                                type="button"
                                className="overflow-hidden rounded-2xl border border-neutral-200 bg-white text-left shadow-sm"
                                onClick={() => data.onOpenDetail?.(getAttachmentSrc(attachment))}
                              >
                                <LazyAttachmentImage
                                  attachment={attachment}
                                  alt={attachment.name}
                                  className="aspect-[4/3] w-full"
                                />
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {data.status === "generating" && !data.content ? (
                        <div className="flex flex-col gap-6 py-6 opacity-40">
                          <div className="h-4 w-[92%] rounded-full bg-neutral-100" />
                          <div className="h-4 w-[65%] rounded-full bg-neutral-100" />
                          <div className="h-4 w-[82%] rounded-full bg-neutral-100" />
                        </div>
                      ) : data.content ? (
                        <MarkdownRenderer content={data.content} />
                      ) : (
                        <MarkdownRenderer content="" />
                      )}
                    </div>
                  ) : (
                    <p className="mindmap-node-shell__content-inner whitespace-pre-wrap break-words text-[15px] leading-7 text-neutral-700">
                      {data.content}
                    </p>
                  )}
                </ScrollArea>
              )}

              {!isFile && footerAttachments.length > 0 && (
                <div className="mindmap-attachments-row">
                  {footerAttachments.map((att, i) => {
                    const Icon = attachmentIcon(att.kind);
                    if (att.kind === "image") {
                      const isUploading = att.id.startsWith("temp-");
                      return (
                        <div key={att.id || i} className="mindmap-attachment-thumb" onClick={() => data.onOpenDetail?.(getAttachmentSrc(att))}>
                          <div className="mindmap-attachment-thumb__link">
                            <LazyAttachmentImage
                              attachment={att}
                              alt={att.name}
                              className="mindmap-attachment-thumb__image"
                            />
                            {isUploading && <div className="mindmap-upload-pulse-ring" />}
                          </div>
                          <button className="mindmap-attachment-thumb__remove" onClick={(e) => { e.stopPropagation(); data.onRemoveAttachment?.(att.id); }}>
                            <X className="size-2.5" />
                          </button>
                        </div>
                      );
                    }
                    return (
                      <div key={att.id || i} className="mindmap-attachment-pill">
                        <Icon className="size-3.5 shrink-0" />
                        <span className="max-w-[120px] truncate">{att.name}</span>
                        <button className="mindmap-attachment-pill__remove" onClick={() => data.onRemoveAttachment?.(att.id)}>
                          <X className="size-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mindmap-node-shell__footer node-drag-handle !pt-0" ref={footerControlsRef}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {isUser ? (
                    <div className="mindmap-prompt-actions mindmap-prompt-actions--composer !gap-2.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="nodrag mindmap-action-icon h-9 w-9 shrink-0 rounded-xl"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Plus className="size-4.5" />
                      </Button>
                      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileChange} />
                      <div className="mindmap-pill-menu shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn("nodrag px-3 h-9 gap-2 font-semibold rounded-xl border border-neutral-200/60 bg-white/50", openPanel === "mode" && "bg-neutral-100/80")}
                          onClick={() => setOpenPanel(openPanel === "mode" ? null : "mode")}
                        >
                          <ActivePromptModeIcon className="size-4 text-neutral-400" />
                          <span className="truncate">{activePromptModeMeta.label}</span>
                          <ChevronDown className="size-3.5 opacity-40 shrink-0" />
                        </Button>
                        {openPanel === "mode" && (
                          <div className="mindmap-pill-menu__panel nodrag">
                            {PROMPT_MODES.map((mode) => {
                              const { icon: Icon } = promptModeMeta[mode];
                              return (
                                <button
                                  key={mode}
                                  className={cn("mindmap-pill-menu__item", mode === activePromptMode && "mindmap-pill-menu__item--active")}
                                  onClick={() => {
                                    data.onChangePromptMode?.(mode);
                                    setOpenPanel(null);
                                  }}
                                >
                                  <Icon className="size-4.5" />
                                  <div className="mindmap-pill-menu__item-copy text-left">
                                    <strong>{promptModeMeta[mode].label}</strong>
                                    <small className="opacity-60">{promptModeMeta[mode].description}</small>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {!isCodePromptMode ? (
                        <>
                          <div className="mindmap-pill-menu shrink-0 max-w-[220px] min-w-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              className={cn("nodrag px-3 h-9 gap-2 font-semibold rounded-xl border border-neutral-200/60 bg-white/50 w-full justify-between", openPanel === "model" && "bg-neutral-100/80")}
                              onClick={() => setOpenPanel(openPanel === "model" ? null : "model")}
                            >
                              <span className="truncate text-neutral-500 font-bold tracking-tight">{activeModelOption.label}</span>
                              <ChevronDown className="size-3.5 opacity-40 shrink-0" />
                            </Button>
                            {openPanel === "model" && (
                              <div className="mindmap-pill-menu__panel nodrag">
                                {modelOptions.map((opt) => (
                                  <button
                                    key={opt.value}
                                    className={cn("mindmap-pill-menu__item", opt.value === activeModel && "mindmap-pill-menu__item--active")}
                                    onClick={() => {
                                      data.onChangeModel?.(opt.value);
                                      setOpenPanel(null);
                                    }}
                                  >
                                    <div className="mindmap-pill-menu__item-copy text-left">
                                      <strong className="text-[13px]">{opt.label}</strong>
                                      <small className="opacity-60 text-[11px]">{opt.description}</small>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="mindmap-pill-menu shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              className={cn("nodrag px-3 h-9 gap-2 font-semibold rounded-xl border border-neutral-200/60 bg-white/50", openPanel === "tools" && "bg-neutral-100/80")}
                              onClick={() => setOpenPanel(openPanel === "tools" ? null : "tools")}
                            >
                              <SlidersHorizontal className="size-4 text-neutral-400" />
                              <span className="truncate">Tools</span>
                              {enabledTools.length > 0 ? <span className="rounded-full bg-neutral-900 px-1.5 py-0.5 text-[10px] text-white">{enabledTools.length}</span> : null}
                              <ChevronDown className="size-3.5 opacity-40 shrink-0" />
                            </Button>
                            {openPanel === "tools" && (
                              <div className="mindmap-pill-menu__panel nodrag">
                                {TOOL_OPTIONS.map((tool) => {
                                  const Icon = tool.icon;
                                  const isSupported = supportedToolSet.has(tool.value);
                                  const isEnabled = enabledTools.includes(tool.value);
                                  return (
                                    <button
                                      key={tool.value}
                                      className={cn("mindmap-pill-menu__item", isEnabled && "mindmap-pill-menu__item--active", !isSupported && "opacity-40")}
                                      onClick={() => {
                                        if (!isSupported) return;
                                        data.onToggleTool?.(tool.value);
                                      }}
                                      disabled={!isSupported}
                                    >
                                      <div className="flex items-center gap-3">
                                        <input
                                          type="checkbox"
                                          checked={isEnabled}
                                          readOnly
                                          tabIndex={-1}
                                          className="size-4 rounded border-neutral-300 text-neutral-900 accent-neutral-900 cursor-pointer"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (isSupported) {
                                              data.onToggleTool?.(tool.value);
                                            }
                                          }}
                                        />
                                        <Icon className="size-4.5" />
                                        <div className="mindmap-pill-menu__item-copy text-left">
                                          <strong>{tool.label}</strong>
                                          <small className="opacity-60">{isSupported ? tool.description : "Unavailable in this mode"}</small>
                                        </div>
                                      </div>
                                    </button>
                                  );
                                })}
                                <div className="mt-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-[11px] text-neutral-500">
                                  Files are provided automatically from attachments.
                                </div>
                              </div>
                            )}
                          </div>
                        </>
                      ) : null}

                      <div className="flex-1" />

                      <Button
                        size="icon"
                        className="nodrag h-10 w-10 rounded-full !bg-neutral-600 !text-white shadow-lg hover:scale-110 active:scale-95 transition-all duration-200"
                        onClick={() => data.onGenerateAiReply?.()}
                      >
                        <ArrowUp className="size-5.5 stroke-[2.5]" />
                      </Button>
                    </div>
                  ) : (
                    <div className="mindmap-node-shell__footer-meta">
                      <div className="mindmap-node-shell__time">
                        <Clock className="mr-1.5 size-3" />
                        {data.createdAt}
                      </div>
                      {data.tokenCount && (
                        <div className="mindmap-node-shell__token">
                          <BarChart className="mr-1.5 size-3" />
                          {tokenCountLabel}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {!isUser && (
                  <div className="mindmap-node-footer__right !ml-auto">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="nodrag mindmap-action-icon size-9 rounded-xl"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Plus className="size-4.5" />
                    </Button>
                    <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileChange} />
                    {!isNote && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="nodrag mindmap-action-icon size-9 rounded-xl"
                        onClick={() => (isImage ? data.onRegenerateImage?.() : isCode ? data.onRegenerateCode?.() : isResult ? data.onRegenerateResult?.() : data.onRegenerateAi?.())}
                      >
                        <RotateCcw className="size-4.5" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </motion.div>

      <Handle
        key="source-handle"
        type="source"
        position={Position.Right}
        id="mindmap-source"
        className={cn("mindmap-handle", (isAi || isCode || isImage || isFile || isNote) ? "mindmap-handle--source-visible" : "mindmap-handle--ghost")}
        style={isSourceHandleVisible ? sourceHandleStyle : hiddenHandleStyle}
      />
    </AnimatePresence>
  );
}

export const ConversationNode = memo(
  ConversationNodeComponent,
  (prevProps, nextProps) =>
    prevProps.selected === nextProps.selected &&
    prevProps.width === nextProps.width &&
    prevProps.height === nextProps.height &&
    prevProps.positionAbsoluteX === nextProps.positionAbsoluteX &&
    prevProps.positionAbsoluteY === nextProps.positionAbsoluteY &&
    !!prevProps.dragging === !!nextProps.dragging &&
    prevProps.data.isMultiDragging === nextProps.data.isMultiDragging &&
    prevProps.data.kind === nextProps.data.kind &&
    prevProps.data.content === nextProps.data.content &&
    prevProps.data.status === nextProps.data.status &&
    prevProps.data.createdAt === nextProps.data.createdAt &&
    prevProps.data.promptMode === nextProps.data.promptMode &&
    prevProps.data.modelConfig?.name === nextProps.data.modelConfig?.name &&
    prevProps.data.isRoot === nextProps.data.isRoot &&
    prevProps.data.isEditing === nextProps.data.isEditing &&
    prevProps.data.isFocusMode === nextProps.data.isFocusMode &&
    prevProps.data.isFocused === nextProps.data.isFocused &&
    areAttachmentsEqual(prevProps.data.attachments, nextProps.data.attachments),
);
