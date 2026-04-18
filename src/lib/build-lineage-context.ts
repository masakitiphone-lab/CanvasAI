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

export type AttachmentSummary = {
  id: string;
  kind: ConversationNodeRecord["attachments"][number]["kind"];
  name: string;
  mimeType?: string;
  sizeBytes?: number;
  storagePath?: string;
};

function getAttachmentSummary(attachment: ConversationNodeRecord["attachments"][number]): AttachmentSummary {
  return {
    id: attachment.id,
    kind: attachment.kind,
    name: attachment.name,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    storagePath: attachment.storagePath,
  };
}

function formatAttachmentSummary(attachment: AttachmentSummary) {
  const parts = [
    `- ${attachment.name}`,
    attachment.kind ? `kind=${attachment.kind}` : null,
    attachment.mimeType ? `mime=${attachment.mimeType}` : null,
    attachment.sizeBytes != null ? `size=${attachment.sizeBytes}B` : null,
  ].filter(Boolean);

  return parts.join(" ");
}

export function buildMetadataOnlyLineage(lineage: LineageEntry[]) {
  return lineage.map((entry) => {
    const attachmentSummaries = entry.attachments?.map(getAttachmentSummary) ?? [];
    const attachmentSection = attachmentSummaries.length > 0
      ? [
          "",
          "### Attached Files",
          "The following files are available as metadata only. Do not assume their contents are readable.",
          ...attachmentSummaries.map(formatAttachmentSummary),
          "If you need to use these files, infer the workflow from the names, kinds, and extensions, then generate code that reads them in Python.",
        ].join("\n")
      : "";

    return {
      ...entry,
      attachments: [],
      content: `${entry.content.trim()}${attachmentSection}`.trim(),
    };
  });
}

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
