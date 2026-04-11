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

export function layoutNodesForMindMap(params: {
  nodes: Array<Node<ConversationNodeRecord>>;
  edges: Edge[];
  options: LayoutOptions;
}) {
  const graph = buildGraph(params.nodes, params.edges, params.options);

  return params.nodes.map((node) => {
    const nextPosition = graph.node(node.id);
    // Use measured dimensions if available for better accuracy
    const width = node.measured?.width ?? node.width ?? params.options.nodeWidth;
    const height = node.measured?.height ?? node.height ?? params.options.nodeHeight;

    if (!nextPosition) {
      return node;
    }

    return {
      ...node,
      position: {
        x: nextPosition.x - width / 2,
        // Align tops: Dagre gives center-y, so subtracting half height makes it a bit messy.
        // To strictly "top align", we keep the top relative to the rank's center.
        y: nextPosition.y - height / 2,
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
  const height = Number(newNode.style?.height ?? options.nodeHeight);

  return {
    x: nextPosition.x - width / 2,
    y: nextPosition.y - height / 2,
  };
}
