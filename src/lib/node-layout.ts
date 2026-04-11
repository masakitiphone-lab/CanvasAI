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
    defaultSize: { width: 980, height: 780 },
    minSize: { width: 960, height: 680 },
    focusedSize: { width: 980, height: 720 },
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
