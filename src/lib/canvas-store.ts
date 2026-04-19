import type { Edge, Node } from "@xyflow/react";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { touchProjectForUser } from "@/lib/project-store";
import { findStoredAttachmentById, findStoredAttachmentByPath } from "@/lib/attachment-store";
import type {
  ConversationAttachment,
  ConversationModelName,
  ConversationNodeRecord,
  ConversationPromptMode,
  ConversationToolName,
} from "@/lib/canvas-types";
import { normalizeModelName } from "@/lib/model-options";

type CanvasNodeRow = {
  id: string;
  project_id: string;
  parent_id: string | null;
  kind: ConversationNodeRecord["kind"];
  content: string;
  status: ConversationNodeRecord["status"];
  position_x: number;
  position_y: number;
  is_root: boolean;
  is_position_pinned: boolean;
  model_provider: string | null;
  model_name: string | null;
  prompt_mode: ConversationPromptMode | null;
  enabled_tools: ConversationToolName[] | null;
  token_count: number | null;
  created_at: string;
};

type CanvasEdgeRow = {
  id: string;
  project_id: string;
  source_id: string;
  target_id: string;
};

type NodeAttachmentRow = {
  id: string;
  project_id: string;
  node_id: string;
  owner_user_id: string;
  kind: ConversationAttachment["kind"];
  name: string;
  mime_type: string | null;
  size_bytes: number | null;
  url: string;
  storage_path: string | null;
  created_at: string;
};

export type PersistedCanvasState = {
  nodes: Node<ConversationNodeRecord>[];
  edges: Edge[];
  source: "cache" | "supabase";
};

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function requireSupabaseClient<T>(client: T | null): T {
  if (client) {
    return client;
  }

  if (isProduction()) {
    throw new Error("Supabase is required in production.");
  }

  throw new Error("Supabase is not configured.");
}

function buildNodeFromRow(row: CanvasNodeRow, attachments: ConversationAttachment[]): Node<ConversationNodeRecord> {
  const promptMode = row.kind === "user" ? row.prompt_mode ?? "auto" : undefined;
  const normalizedModelName =
    row.model_provider === "gemini" && row.model_name
      ? normalizeModelName(row.model_name, promptMode ?? "auto")
      : undefined;

  return {
    id: row.id,
    type: "conversation",
    position: {
      x: row.position_x,
      y: row.position_y,
    },
    data: {
      parentId: row.parent_id,
      kind: row.kind,
      content: row.content,
      attachments,
      modelConfig:
        row.model_provider === "gemini" && normalizedModelName
          ? {
              provider: "gemini",
              name: normalizedModelName as ConversationModelName,
            }
          : undefined,
      promptMode,
      enabledTools: row.enabled_tools ?? [],
      tokenCount: row.token_count ?? undefined,
      status: row.status,
      createdAt: row.created_at,
      isRoot: row.is_root,
      isPositionPinned: row.is_position_pinned,
    },
    draggable: true,
    selectable: true,
  };
}

function buildEdge(source: string, target: string, id: string): Edge {
  return {
    id,
    source,
    target,
    type: "smoothstep",
    selectable: false,
    focusable: false,
    animated: false,
    style: {
      stroke: "#d4d4d4",
      strokeWidth: 1.8,
      opacity: 0.9,
    },
  };
}

async function resolvePersistedAttachment(attachment: ConversationAttachment) {
  const fresh = attachment.storagePath
    ? await findStoredAttachmentByPath(attachment.storagePath)
    : await findStoredAttachmentById(attachment.id);
  return { attachment: fresh ?? attachment, missing: !fresh };
}

export async function loadCanvasStateForUser(projectId: string, userId: string): Promise<PersistedCanvasState | null> {
  const supabase = requireSupabaseClient(await getSupabaseServerClient());
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("owner_user_id", userId)
    .maybeSingle();

  if (projectError) {
    throw new Error("Failed to verify project ownership.");
  }

  if (!project) {
    return null;
  }

  const [nodesRes, edgesRes, attachmentsRes] = await Promise.all([
    supabase.from("canvas_nodes").select("*").eq("project_id", projectId).order("created_at", { ascending: true }),
    supabase.from("canvas_edges").select("*").eq("project_id", projectId),
    supabase.from("node_attachments").select("*").eq("project_id", projectId).eq("owner_user_id", userId),
  ]);

  if (nodesRes.error || edgesRes.error || attachmentsRes.error) {
    throw new Error("Failed to load canvas state from Supabase.");
  }

  const nodeRows = (nodesRes.data ?? []) as CanvasNodeRow[];
  if (nodeRows.length === 0) {
    return null;
  }

  const edgeRows = (edgesRes.data ?? []) as CanvasEdgeRow[];
  const attachmentRows = (attachmentsRes.data ?? []) as NodeAttachmentRow[];
  const attachmentMap = new Map<string, ConversationAttachment[]>();

  for (const attachment of attachmentRows) {
    const current = attachmentMap.get(attachment.node_id) ?? [];
    current.push({
      id: attachment.id,
      kind: attachment.kind,
      name: attachment.name,
      mimeType: attachment.mime_type ?? undefined,
      sizeBytes: attachment.size_bytes ?? undefined,
      url: attachment.url,
      storagePath: attachment.storage_path ?? undefined,
      createdAt: attachment.created_at,
    });
    attachmentMap.set(attachment.node_id, current);
  }

  const resolvedNodes = await Promise.all(
    nodeRows.map(async (row) => {
      const resolvedAttachments = await Promise.all((attachmentMap.get(row.id) ?? []).map(resolvePersistedAttachment));
      const attachments = resolvedAttachments.map((entry) => entry.attachment);
      const hasUnresolvedAttachment = resolvedAttachments.some((entry) => entry.missing);
      const node = buildNodeFromRow(row, attachments);
      if (!hasUnresolvedAttachment) {
        return node;
      }

      return {
        ...node,
        data: {
          ...node.data,
          status: "error" as const,
          content: node.data.content || "Attachment load failed.",
        },
      };
    }),
  );

  const state: PersistedCanvasState = {
    nodes: resolvedNodes,
    edges: edgeRows.map((row) => buildEdge(row.source_id, row.target_id, row.id)),
    source: "supabase",
  };

  return state;
}

export async function saveCanvasState(
  projectId: string,
  userId: string,
  snapshot: {
    nodes: Node<ConversationNodeRecord>[];
    edges: Edge[];
  },
  options?: {
    title?: string;
  },
) {
  const supabase = requireSupabaseClient(await getSupabaseServerClient());

  await touchProjectForUser({
    userId,
    projectId,
    title: options?.title ?? "Untitled canvas",
  });

  const nodeRows: CanvasNodeRow[] = snapshot.nodes.map((node) => ({
    id: node.id,
    project_id: projectId,
    parent_id: node.data.parentId,
    kind: node.data.kind,
    content: node.data.content,
    status: node.data.status,
    position_x: node.position.x,
    position_y: node.position.y,
    is_root: node.data.isRoot,
    is_position_pinned: node.data.isPositionPinned,
    model_provider: node.data.modelConfig?.provider ?? null,
    model_name: node.data.modelConfig?.name ?? null,
    prompt_mode: node.data.kind === "user" ? node.data.promptMode ?? "auto" : null,
    enabled_tools: node.data.kind === "user" ? node.data.enabledTools ?? [] : [],
    token_count: node.data.tokenCount ?? null,
    created_at: node.data.createdAt,
  }));

  const edgeRows: CanvasEdgeRow[] = snapshot.edges.map((edge) => ({
    id: edge.id,
    project_id: projectId,
    source_id: edge.source,
    target_id: edge.target,
  }));

  const attachmentRows: NodeAttachmentRow[] = snapshot.nodes.flatMap((node) =>
    node.data.attachments.map((attachment) => ({
      id: attachment.id,
      project_id: projectId,
      node_id: node.id,
      owner_user_id: userId,
      kind: attachment.kind,
      name: attachment.name,
      mime_type: attachment.mimeType ?? null,
      size_bytes: attachment.sizeBytes ?? null,
      url: attachment.url,
      storage_path: attachment.storagePath ?? null,
      created_at: attachment.createdAt,
    })),
  );

  const [existingNodes, existingEdges, existingAttachments] = await Promise.all([
    supabase.from("canvas_nodes").select("id").eq("project_id", projectId),
    supabase.from("canvas_edges").select("id").eq("project_id", projectId),
    supabase.from("node_attachments").select("id").eq("project_id", projectId).eq("owner_user_id", userId),
  ]);

  if (existingNodes.error || existingEdges.error || existingAttachments.error) {
    throw new Error("Failed to diff existing canvas state.");
  }

  const currentNodeIds = new Set(nodeRows.map((row) => row.id));
  const currentEdgeIds = new Set(edgeRows.map((row) => row.id));
  const currentAttachmentIds = new Set(attachmentRows.map((row) => row.id));

  const nodeIdsToDelete = (existingNodes.data ?? []).map((row) => row.id).filter((id) => !currentNodeIds.has(id));
  const edgeIdsToDelete = (existingEdges.data ?? []).map((row) => row.id).filter((id) => !currentEdgeIds.has(id));
  const attachmentIdsToDelete = (existingAttachments.data ?? []).map((row) => row.id).filter((id) => !currentAttachmentIds.has(id));

  await Promise.all([
    nodeRows.length > 0 ? supabase.from("canvas_nodes").upsert(nodeRows) : Promise.resolve(),
    edgeRows.length > 0 ? supabase.from("canvas_edges").upsert(edgeRows) : Promise.resolve(),
    attachmentRows.length > 0 ? supabase.from("node_attachments").upsert(attachmentRows) : Promise.resolve(),
  ]);

  await Promise.all([
    nodeIdsToDelete.length > 0 ? supabase.from("canvas_nodes").delete().in("id", nodeIdsToDelete) : Promise.resolve(),
    edgeIdsToDelete.length > 0 ? supabase.from("canvas_edges").delete().in("id", edgeIdsToDelete) : Promise.resolve(),
    attachmentIdsToDelete.length > 0 ? supabase.from("node_attachments").delete().in("id", attachmentIdsToDelete) : Promise.resolve(),
  ]);

  return { source: "supabase" as const };
}

export async function deleteCanvasState(projectId: string, userId: string) {
  const supabase = requireSupabaseClient(await getSupabaseServerClient());
  const { error } = await supabase.from("projects").delete().eq("id", projectId).eq("owner_user_id", userId);

  if (error) {
    throw new Error("Failed to delete project.");
  }

  return { source: "supabase" as const };
}
