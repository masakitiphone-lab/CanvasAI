import type { NodeKind } from "@/lib/canvas-types";

export type NodeDimensions = {
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
    minSize: { width: 540, height: 320 },
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

export function getContentAwareNodeSize(kind: NodeKind, content: string): NodeDimensions {
  const base = getNodeDefaultSize(kind);

  if (kind !== "ai" && kind !== "code" && kind !== "result") {
    return base;
  }

  const wrappedLines = estimateWrappedLineCount(content, kind === "code" ? 74 : kind === "result" ? 70 : 68);
  const lineCount = Math.max(1, wrappedLines);
  const nextHeight = Math.max(kind === "code" ? 300 : kind === "result" ? 260 : 220, Math.min(720, 156 + lineCount * 26));

  return {
    width: kind === "code" ? 820 : kind === "result" ? 720 : 760,
    height: nextHeight,
  };
}
