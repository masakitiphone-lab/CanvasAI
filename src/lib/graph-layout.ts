import dagre from "@dagrejs/dagre";
import type { Edge, Node, XYPosition } from "@xyflow/react";
import type { ConversationNodeRecord } from "@/lib/canvas-types";

type LayoutOptions = {
  nodeWidth: number;
  nodeHeight: number;
  rankSep: number;
  nodeSep: number;
};

function buildGraph(
  nodes: Array<Node<ConversationNodeRecord>>,
  edges: Edge[],
  options: LayoutOptions,
) {
  const graph = new dagre.graphlib.Graph();

  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: "LR",
    ranksep: options.rankSep,
    nodesep: options.nodeSep,
  });

  for (const node of nodes) {
    const width = Number(node.style?.width ?? options.nodeWidth);
    const height = Number(node.style?.height ?? options.nodeHeight);
    graph.setNode(node.id, {
      width,
      height,
    });
  }

  for (const edge of edges) {
    graph.setEdge(edge.source, edge.target);
  }

  dagre.layout(graph);
  return graph;
}

function buildRowGroups(
  nodes: Array<Node<ConversationNodeRecord>>,
  graph: ReturnType<typeof buildGraph>,
  options: LayoutOptions,
) {
  const tolerance = Math.max(32, Math.round(options.nodeHeight * 0.35));
  const rows: Array<{
    centerY: number;
    nodes: Array<Node<ConversationNodeRecord>>;
  }> = [];

  const sortedNodes = [...nodes].sort((left, right) => {
    const leftPosition = graph.node(left.id);
    const rightPosition = graph.node(right.id);
    return (leftPosition?.y ?? 0) - (rightPosition?.y ?? 0);
  });

  for (const node of sortedNodes) {
    const position = graph.node(node.id);
    if (!position) {
      continue;
    }

    const existingRow = rows.find((row) => Math.abs(row.centerY - position.y) <= tolerance);
    if (existingRow) {
      existingRow.nodes.push(node);
      existingRow.centerY = (existingRow.centerY + position.y) / 2;
      continue;
    }

    rows.push({
      centerY: position.y,
      nodes: [node],
    });
  }

  return rows;
}

export function layoutNodesForMindMap(params: {
  nodes: Array<Node<ConversationNodeRecord>>;
  edges: Edge[];
  options: LayoutOptions;
}) {
  const graph = buildGraph(params.nodes, params.edges, params.options);
  const rows = buildRowGroups(params.nodes, graph, params.options);
  const rowTopByNodeId = new Map<string, number>();

  let cursorTop = 0;
  rows.forEach((row, rowIndex) => {
    const rowHeight = Math.max(
      ...row.nodes.map((node) => Number(node.style?.height ?? node.height ?? params.options.nodeHeight)),
      params.options.nodeHeight,
    );

    if (rowIndex === 0) {
      const firstTop = Math.min(
        ...row.nodes.map((node) => {
          const position = graph.node(node.id);
          const height = Number(node.style?.height ?? node.height ?? params.options.nodeHeight);
          return (position?.y ?? 0) - height / 2;
        }),
      );
      cursorTop = Number.isFinite(firstTop) ? firstTop : 0;
    }

    row.nodes.forEach((node) => rowTopByNodeId.set(node.id, cursorTop));
    cursorTop += rowHeight + params.options.nodeSep;
  });

  return params.nodes.map((node) => {
    const nextPosition = graph.node(node.id);
    const width = node.measured?.width ?? node.width ?? params.options.nodeWidth;

    if (!nextPosition) {
      return node;
    }

    return {
      ...node,
      position: {
        x: nextPosition.x - width / 2,
        y: rowTopByNodeId.get(node.id) ?? nextPosition.y,
      },
    };
  });
}

export function getSuggestedChildPosition(params: {
  nodes: Array<Node<ConversationNodeRecord>>;
  edges: Edge[];
  newNode: Node<ConversationNodeRecord>;
  newEdge: Edge;
  options: LayoutOptions;
}): XYPosition {
  const { nodes, edges, newNode, newEdge, options } = params;
  const graph = buildGraph(nodes.concat(newNode), edges.concat(newEdge), options);

  const nextPosition = graph.node(newNode.id);
  const width = Number(newNode.style?.width ?? options.nodeWidth);
  const parentNode = nodes.find((node) => node.id === newEdge.source);
  const parentTop = parentNode?.position.y ?? null;

  return {
    x: nextPosition.x - width / 2,
    y: parentTop ?? nextPosition.y - Number(newNode.style?.height ?? options.nodeHeight) / 2,
  };
}
