import type { NodeId, ZhiJianDocument, ZhiJianNode } from './documentTypes';

export function getNode(document: ZhiJianDocument, nodeId: NodeId): ZhiJianNode {
  const node = document.nodes[nodeId];
  if (!node) throw new Error(`Node "${nodeId}" does not exist.`);
  return node;
}

export function getParent(document: ZhiJianDocument, nodeId: NodeId): ZhiJianNode | null {
  const node = getNode(document, nodeId);
  return node.parentId ? getNode(document, node.parentId) : null;
}

export function getNodeIndex(document: ZhiJianDocument, nodeId: NodeId): number {
  const parent = getParent(document, nodeId);
  if (!parent) return 0;
  return parent.children.indexOf(nodeId);
}

export function isDescendant(document: ZhiJianDocument, ancestorId: NodeId, possibleDescendantId: NodeId): boolean {
  const ancestor = getNode(document, ancestorId);
  const stack = [...ancestor.children];

  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId) continue;
    if (currentId === possibleDescendantId) return true;
    stack.push(...getNode(document, currentId).children);
  }

  return false;
}

export function getSubtreeIds(document: ZhiJianDocument, nodeId: NodeId): NodeId[] {
  const ids: NodeId[] = [];
  const walk = (currentId: NodeId) => {
    ids.push(currentId);
    for (const childId of getNode(document, currentId).children) walk(childId);
  };
  walk(nodeId);
  return ids;
}

export function getPreviousSiblingId(document: ZhiJianDocument, nodeId: NodeId): NodeId | null {
  const parent = getParent(document, nodeId);
  if (!parent) return null;
  const index = parent.children.indexOf(nodeId);
  return index > 0 ? parent.children[index - 1] : null;
}

export function getPreviousVisibleNodeId(document: ZhiJianDocument, nodeId: NodeId): NodeId | null {
  const parent = getParent(document, nodeId);
  if (!parent) return null;
  const index = parent.children.indexOf(nodeId);
  if (index > 0) {
    let candidate = getNode(document, parent.children[index - 1]);
    while (candidate.children.length > 0) {
      candidate = getNode(document, candidate.children[candidate.children.length - 1]);
    }
    return candidate.id;
  }
  return parent.id === document.rootId ? null : parent.id;
}

export function replaceNode(document: ZhiJianDocument, node: ZhiJianNode): ZhiJianDocument {
  return {
    ...document,
    nodes: {
      ...document.nodes,
      [node.id]: node,
    },
  };
}
