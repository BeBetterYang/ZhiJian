import type { NodeId, ZhiJianDocument } from '../core';
import type { MutableOutlineViewState, OutlineViewState } from './outlineTypes';

export function collectExpandableIds(document: ZhiJianDocument, startNodeId = document.rootId): Set<NodeId> {
  const ids = new Set<NodeId>();
  const walk = (nodeId: NodeId) => {
    const node = document.nodes[nodeId];
    if (!node) return;
    if (node.children.length > 0) ids.add(node.id);
    node.children.forEach(walk);
  };
  walk(startNodeId);
  return ids;
}

export function createOutlineViewState(document: ZhiJianDocument): MutableOutlineViewState {
  return {
    focusNodeId: null,
    expandedIds: collectExpandableIds(document),
  };
}

export function isExpanded(viewState: OutlineViewState, nodeId: NodeId, hasChildren: boolean): boolean {
  if (!hasChildren) return true;
  return viewState.expandedIds.has(nodeId);
}

export function setNodeExpanded(
  viewState: MutableOutlineViewState,
  nodeId: NodeId,
  expanded: boolean,
): MutableOutlineViewState {
  const expandedIds = new Set(viewState.expandedIds);
  if (expanded) expandedIds.add(nodeId);
  else expandedIds.delete(nodeId);
  return {
    ...viewState,
    expandedIds,
  };
}
