import type { Node } from "@xyflow/react";
import type { ConversationNodeRecord } from "@/lib/canvas-types";

export type LineageEntry = {
  id: string;
  parentId: string | null;
  kind: ConversationNodeRecord["kind"];
  content: string;
  attachments: ConversationNodeRecord["attachments"];
  status: ConversationNodeRecord["status"];
  createdAt: string;
};

export function buildLineageContext(
  nodes: Array<Node<ConversationNodeRecord>>,
  targetNodeId: string,
): LineageEntry[] {
  const nodeLookup = new Map(nodes.map((node) => [node.id, node]));
  const lineage: LineageEntry[] = [];

  let current = nodeLookup.get(targetNodeId);

  while (current) {
    lineage.push({
      id: current.id,
      parentId: current.data.parentId,
      kind: current.data.kind,
      content: current.data.content,
      attachments: current.data.attachments,
      status: current.data.status,
      createdAt: current.data.createdAt,
    });

    if (!current.data.parentId) {
      break;
    }

    current = nodeLookup.get(current.data.parentId);
  }

  return lineage.reverse();
}
