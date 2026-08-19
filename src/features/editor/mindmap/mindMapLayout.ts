import type { ZhiJianDocument, NodeId } from '../core';

export interface LayoutNode {
  id: NodeId;
  x: number;
  y: number;
  width: number;
  height: number;
}

const NODE_WIDTH = 180;
const NODE_HEIGHT = 80;
const HORIZONTAL_SPACING = 100;
const VERTICAL_SPACING = 40;

/**
 * Compute auto layout for mind map nodes using a simple tree layout algorithm.
 * Root is centered, children fan out horizontally to the right.
 * No persistent x/y coordinates - layout is computed from tree structure each render.
 */
export function computeMindMapLayout(document: ZhiJianDocument): LayoutNode[] {
  const layoutNodes: LayoutNode[] = [];
  const { rootId, nodes } = document;

  // Root node position
  const rootNode = nodes[rootId];
  if (!rootNode) return [];

  interface LayoutContext {
    currentY: number;
  }

  const context: LayoutContext = { currentY: 0 };

  function layoutSubtree(nodeId: NodeId, depth: number, context: LayoutContext): number {
    const node = nodes[nodeId];
    if (!node) return 0;

    const x = depth * (NODE_WIDTH + HORIZONTAL_SPACING);

    if (node.children.length === 0) {
      // Leaf node
      const y = context.currentY;
      context.currentY += NODE_HEIGHT + VERTICAL_SPACING;

      layoutNodes.push({
        id: nodeId,
        x,
        y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      });

      return y;
    } else {
      // Internal node - layout children first
      const childrenYPositions: number[] = [];
      for (const childId of node.children) {
        const childY = layoutSubtree(childId, depth + 1, context);
        childrenYPositions.push(childY);
      }

      // Center this node vertically among its children
      const firstChildY = childrenYPositions[0];
      const lastChildY = childrenYPositions[childrenYPositions.length - 1];
      const y = (firstChildY + lastChildY) / 2;

      layoutNodes.push({
        id: nodeId,
        x,
        y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      });

      return y;
    }
  }

  // Layout root and all descendants
  layoutSubtree(rootId, 0, context);

  // Center the entire tree vertically around y=0
  if (layoutNodes.length > 0) {
    const minY = Math.min(...layoutNodes.map(n => n.y));
    const maxY = Math.max(...layoutNodes.map(n => n.y));
    const centerOffset = -(minY + maxY) / 2;

    for (const node of layoutNodes) {
      node.y += centerOffset;
    }
  }

  return layoutNodes;
}
