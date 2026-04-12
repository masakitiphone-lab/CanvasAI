"use client";

import { memo, useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent, type DragEvent as ReactDragEvent, useCallback } from "react";
import { Handle, Position, useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowRight,
  ArrowUp,
  BarChart,
  Bot,
  Camera,
  ChevronDown,
  Clock,
  Clock3,
  FileEdit,
  FileImage,
  FileText,
  Globe,
  ImagePlus,
  Link2,
  Mic,
  MoreHorizontal,
  PencilLine,
  Plus,
  RefreshCcw,
  RotateCcw,
  Search,
  StickyNote,
  Trash2,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  ConversationAttachment,
  ConversationImageModelName,
  ConversationNodeData,
  ConversationPromptMode,
  ConversationTextModelName,
  ConversationModelName,
  NodeStatus,
} from "@/lib/canvas-types";
import {
  getDefaultModelForPromptMode,
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

const statusMeta: Record<
  Extract<NodeStatus, "generating" | "error" | "outdated">,
  { label: string; variant: "secondary" | "destructive" | "outline"; icon: typeof Clock3 }
> = {
  generating: { label: "生成中", variant: "secondary", icon: Clock3 },
  error: { label: "エラー", variant: "destructive", icon: AlertCircle },
  outdated: { label: "要更新", variant: "outline", icon: PencilLine },
};

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
  if (kind === "file") return "ファイル";

  const trimmed = content.trim();
  if (!trimmed) {
    if (kind === "user") return "新しいプロンプト";
    if (kind === "image") return "画像生成";
    if (kind === "note") return "メモ";
    return "AIレスポンス";
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
  dx: number;
  dy: number;
  minWidth: number;
  minHeight: number;
  startWidth: number;
  startHeight: number;
  startX: number;
  startY: number;
}) {
  const { direction, dx, dy, minWidth, minHeight, startWidth, startHeight, startX, startY } = params;
  let width = startWidth;
  let height = startHeight;
  let x = startX;
  let y = startY;

  if (direction.includes("right")) width = Math.max(minWidth, startWidth + dx);
  if (direction.includes("left")) {
    width = Math.max(minWidth, startWidth - dx);
    x = startX + (startWidth - width);
  }
  if (direction.includes("bottom")) height = Math.max(minHeight, startHeight + dy);
  if (direction.includes("top")) {
    height = Math.max(minHeight, startHeight - dy);
    y = startY + (startHeight - height);
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
  id: nodeId,
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
  const isImage = data.kind === "image";
  const isFile = data.kind === "file";
  const isNote = data.kind === "note";
  const isEditing = Boolean(data.isEditing);
  const title = deriveTitle(data.content, data.kind);
  const statusKey: keyof typeof statusMeta | null =
    data.status === "generating" || data.status === "error" || data.status === "outdated" ? data.status : null;
  const StatusIcon = statusKey ? statusMeta[statusKey].icon : null;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const footerControlsRef = useRef<HTMLDivElement | null>(null);
  const [openPanel, setOpenPanel] = useState<"mode" | "model" | null>(null);
  const imageAttachments = data.attachments.filter((attachment) => attachment.kind === "image");
  const otherAttachments = data.attachments.filter((attachment) => attachment.kind !== "image");
  const activePromptMode = data.promptMode ?? "auto";
  const modelOptions = activePromptMode === "image-create" ? IMAGE_MODEL_OPTIONS : TEXT_MODEL_OPTIONS;
  const activeModel = normalizeModelName(data.modelConfig?.name, activePromptMode);
  const activeModelOption = modelOptions.find((option) => option.value === activeModel) ?? modelOptions[0];
  const activePromptModeMeta = promptModeMeta[activePromptMode];
  const ActivePromptModeIcon = activePromptModeMeta.icon;
  const nodeLabel = isUser ? "Prompt" : isImage ? "Image" : isFile ? "File" : isNote ? "Note" : "Response";
  const NodeLabelIcon = isUser ? UserRound : isImage ? Camera : isFile ? FileText : isNote ? StickyNote : Bot;
  const tokenCountLabel = formatTokenCount(data.tokenCount);
  const defaultSize = getNodeDefaultSize(data.kind);
  const minSize = getNodeMinSize(data.kind);
  const defaultWidth = defaultSize.width;
  const preferredHeight = defaultSize.height;
  const minWidth = minSize.width;
  const minHeight = minSize.height;
  const nodeWidth = Math.max(Number(width ?? defaultWidth), minWidth);
  const nodeHeight = Math.max(Number(height ?? preferredHeight), minHeight);
  const isTargetHandleVisible = isUser || isNote;
  const isSourceHandleVisible = isAi || isImage || isFile || isNote;

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

  const handleScrollAreaWheelCapture = (event: ReactWheelEvent<HTMLDivElement>) => {
    // Scroll navigation disabled as per user request
  };

  const handleTextareaWheelCapture = (event: ReactWheelEvent<HTMLTextAreaElement>) => {
    // Scroll navigation disabled as per user request
  };

  const handleResizeStart = (direction: ResizeDirection, event: ReactPointerEvent<HTMLDivElement>) => {
    if (!data.onResizeNode) return;
    event.preventDefault();
    event.stopPropagation();
    const pointerId = event.pointerId;
    const target = event.currentTarget;
    target.setPointerCapture(pointerId);

    const startPointer = { x: event.clientX, y: event.clientY };
    const startWidth = nodeWidth;
    const startHeight = nodeHeight;
    const startX = positionAbsoluteX;
    const startY = positionAbsoluteY;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const currentZoom = getViewport().zoom;
      const dx = (moveEvent.clientX - startPointer.x) / currentZoom;
      const dy = (moveEvent.clientY - startPointer.y) / currentZoom;

      const nextBounds = computeResizedBounds({
        direction,
        dx,
        dy,
        minWidth,
        minHeight,
        startWidth,
        startHeight,
        startX,
        startY,
      });
      data.onResizeNode?.(nextBounds);
    };

    const clearListeners = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
    };

    const onPointerUp = () => clearListeners();

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
                        <strong>{data.content || "ファイルを準備しています"}</strong>
                        <span>{data.status === "error" ? "読み込みに失敗しました" : "読み込み中"}</span>
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
                  placeholder={isUser ? "ここにプロンプトを書いてください" : "ここにメモを書いてください"}
                />
              ) : (
                <ScrollArea className="mindmap-node-shell__content nodrag nowheel rounded-[22px]" onWheelCapture={handleScrollAreaWheelCapture}>
                  {isAi ? (
                    <div className="mindmap-node-shell__content-inner">
                      {data.status === "generating" ? (
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

              {(isUser ? data.attachments : otherAttachments).length > 0 && (
                <div className="mindmap-attachments-row">
                  {(isUser ? data.attachments : otherAttachments).map((att, i) => {
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
                    <div className="mindmap-prompt-actions !gap-2.5">
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
                        onClick={() => (isImage ? data.onRegenerateImage?.() : data.onRegenerateAi?.())}
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
        className={cn("mindmap-handle", (isAi || isImage || isFile || isNote) ? "mindmap-handle--source-visible" : "mindmap-handle--ghost")}
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
