import type { ConversationAttachment, NodeKind } from "@/lib/canvas-types";

export type NodeDimensions = {
  width: number;
  height: number;
};

export type AttachmentDimensions = {
  width: number;
  height: number;
};

type NodeLayoutConfig = {
  defaultSize: NodeDimensions;
  minSize: NodeDimensions;
  focusedSize: NodeDimensions;
};

export const NODE_LAYOUT: Record<NodeKind, NodeLayoutConfig> = {
  user: {
    defaultSize: { width: 560, height: 340 },
    minSize: { width: 560, height: 360 },
    focusedSize: { width: 760, height: 520 },
  },
  ai: {
    defaultSize: { width: 760, height: 320 },
    minSize: { width: 720, height: 220 },
    focusedSize: { width: 920, height: 760 },
  },
  code: {
    defaultSize: { width: 820, height: 420 },
    minSize: { width: 760, height: 300 },
    focusedSize: { width: 1040, height: 840 },
  },
  result: {
    defaultSize: { width: 720, height: 360 },
    minSize: { width: 660, height: 260 },
    focusedSize: { width: 920, height: 760 },
  },
  image: {
    defaultSize: { width: 920, height: 640 },
    minSize: { width: 860, height: 560 },
    focusedSize: { width: 1180, height: 860 },
  },
  file: {
    defaultSize: { width: 420, height: 236 },
    minSize: { width: 400, height: 220 },
    focusedSize: { width: 760, height: 520 },
  },
  note: {
    defaultSize: { width: 420, height: 260 },
    minSize: { width: 380, height: 220 },
    focusedSize: { width: 760, height: 520 },
  },
};

export function getNodeDefaultSize(kind: NodeKind): NodeDimensions {
  return NODE_LAYOUT[kind].defaultSize;
}

export function getNodeMinSize(kind: NodeKind): NodeDimensions {
  return NODE_LAYOUT[kind].minSize;
}

export function getNodeFocusedSize(kind: NodeKind): NodeDimensions {
  return NODE_LAYOUT[kind].focusedSize;
}

function estimateWrappedLineCount(content: string, charsPerLine: number) {
  const lines = content.split(/\r?\n/);
  return lines.reduce((count, line) => {
    const lineLength = line.trim().length;
    return count + Math.max(1, Math.ceil(lineLength / charsPerLine));
  }, 0);
}

const RESULT_NODE_IMAGE_HEIGHT = 360;
const RESULT_NODE_IMAGE_GAP = 20;
const RESULT_NODE_TEXT_BASE_HEIGHT = 280;
const RESULT_NODE_HEADER_HEIGHT = 200;

const CODE_NODE_TEXT_BASE_HEIGHT = 320;
const CODE_NODE_MAX_HEIGHT = 1080;

export function getContentAwareNodeSize(
  kind: NodeKind,
  content: string,
  attachments?: ConversationAttachment[]
): NodeDimensions {
  const base = getNodeDefaultSize(kind);

  if (kind !== "ai" && kind !== "code" && kind !== "result") {
    return base;
  }

  const imageAttachments = attachments?.filter((a) => a.kind === "image") ?? [];
  const hasImages = imageAttachments.length > 0;

  if (kind === "result") {
    const wrappedLines = estimateWrappedLineCount(content, 70);
    const lineCount = Math.max(1, wrappedLines);
    const textHeight = RESULT_NODE_HEADER_HEIGHT + lineCount * 26;
    const imageHeight = hasImages
      ? RESULT_NODE_IMAGE_HEIGHT + (imageAttachments.length - 1) * (RESULT_NODE_IMAGE_HEIGHT / 3) + (imageAttachments.length > 1 ? RESULT_NODE_IMAGE_GAP : 0)
      : 0;
    const nextHeight = Math.max(RESULT_NODE_TEXT_BASE_HEIGHT, textHeight + imageHeight);

    return {
      width: 720,
      height: Math.min(1080, nextHeight),
    };
  }

  if (kind === "code") {
    const wrappedLines = estimateWrappedLineCount(content, 74);
    const lineCount = Math.max(1, wrappedLines);
    const nextHeight = Math.max(CODE_NODE_TEXT_BASE_HEIGHT, Math.min(CODE_NODE_MAX_HEIGHT, 156 + lineCount * 26));

    return {
      width: 820,
      height: nextHeight,
    };
  }

  const wrappedLines = estimateWrappedLineCount(content, 68);
  const lineCount = Math.max(1, wrappedLines);
  const nextHeight = Math.max(220, Math.min(720, 156 + lineCount * 26));

  return {
    width: 760,
    height: nextHeight,
  };
}
