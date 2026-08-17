import type { OutlineData } from 'react-outliner-neo';
import {
  createId,
  documentCommands,
  getNode,
  getParent,
  type DocumentCommand,
  type NodeId,
  type ZhiJianDocument,
  type ZhiJianNode,
} from '../core';
import type { MutableOutlineViewState, OutlineViewState } from './outlineTypes';
import { isExpanded, setNodeExpanded } from './outlineViewState';

type OutlinerNode = OutlineData & { children?: OutlinerNode[] };

interface FlatOutlinerNode {
  id: NodeId;
  topic: string;
  parentId: NodeId;
  index: number;
  expanded: boolean;
  children: OutlinerNode[];
}

export interface OutlineDiffResult {
  commands: DocumentCommand[];
  viewState: MutableOutlineViewState;
  idReplacements: Map<string, NodeId>;
  usedWholeTreeReplace: false;
}

export function documentToOutlinerData(
  document: ZhiJianDocument,
  viewState: OutlineViewState,
): OutlineData[] {
  const visibleRootId = viewState.focusNodeId ?? document.rootId;
  const visibleRoot = getNode(document, visibleRootId);
  return visibleRoot.children.map((childId) => nodeToOutlinerData(document, childId, viewState));
}

export function getOutlineTitle(document: ZhiJianDocument, viewState: OutlineViewState): string {
  return getNode(document, viewState.focusNodeId ?? document.rootId).content || '未命名';
}

export function getOutlineBreadcrumb(document: ZhiJianDocument, focusNodeId: NodeId | null) {
  const path: Array<{ id: NodeId; content: string }> = [];
  let current: ZhiJianNode | null = focusNodeId ? getNode(document, focusNodeId) : null;
  while (current) {
    path.unshift({ id: current.id, content: current.content || '未命名' });
    current = current.parentId ? getNode(document, current.parentId) : null;
  }
  return [{ id: document.rootId, content: getNode(document, document.rootId).content || '未命名' }, ...path.filter((item) => item.id !== document.rootId)];
}

function nodeToOutlinerData(document: ZhiJianDocument, nodeId: NodeId, viewState: OutlineViewState): OutlinerNode {
  const node = getNode(document, nodeId);
  const children = node.children.map((childId) => nodeToOutlinerData(document, childId, viewState));
  return {
    id: node.id,
    topic: node.content,
    expanded: isExpanded(viewState, node.id, children.length > 0),
    children,
  };
}

function flattenOutlinerTree(items: OutlinerNode[], rootParentId: NodeId, map = new Map<NodeId, FlatOutlinerNode>()) {
  items.forEach((item, index) => {
    const children = item.children ?? [];
    map.set(item.id, {
      id: item.id,
      topic: item.topic,
      parentId: rootParentId,
      index,
      expanded: item.expanded !== false,
      children,
    });
    flattenOutlinerTree(children, item.id, map);
  });
  return map;
}

function collectSubtreeIds(document: ZhiJianDocument, nodeId: NodeId, ids = new Set<NodeId>()) {
  const node = getNode(document, nodeId);
  node.children.forEach((childId) => {
    ids.add(childId);
    collectSubtreeIds(document, childId, ids);
  });
  return ids;
}

function getTopDeletedIds(document: ZhiJianDocument, deletedIds: Set<NodeId>) {
  return [...deletedIds].filter((nodeId) => {
    let parent = getParent(document, nodeId);
    while (parent) {
      if (deletedIds.has(parent.id)) return false;
      parent = getParent(document, parent.id);
    }
    return true;
  });
}

function replaceId(id: NodeId, replacements: Map<string, NodeId>): NodeId {
  return replacements.get(id) ?? id;
}

function findSplit(
  document: ZhiJianDocument,
  previousItems: OutlinerNode[],
  nextItems: OutlinerNode[],
  knownIds: Set<NodeId>,
): { nodeId: NodeId; offset: number; newItem: OutlinerNode } | null {
  for (let index = 0; index < nextItems.length; index += 1) {
    const item = nextItems[index];
    if (knownIds.has(item.id) || index === 0) continue;
    const previousSibling = nextItems[index - 1];
    if (!knownIds.has(previousSibling.id)) continue;
    const previousNode = document.nodes[previousSibling.id];
    if (!previousNode) continue;
    if (previousNode.content === `${previousSibling.topic}${item.topic}`) {
      return {
        nodeId: previousSibling.id,
        offset: previousSibling.topic.length,
        newItem: item,
      };
    }
  }

  for (const previousItem of previousItems) {
    const nextItem = nextItems.find((item) => item.id === previousItem.id);
    if (!nextItem) continue;
    const nested = findSplit(document, previousItem.children ?? [], nextItem.children ?? [], knownIds);
    if (nested) return nested;
  }

  return null;
}

function collectUnknownItems(items: OutlinerNode[], knownIds: Set<NodeId>, output: OutlinerNode[] = []) {
  items.forEach((item) => {
    if (!knownIds.has(item.id)) output.push(item);
    collectUnknownItems(item.children ?? [], knownIds, output);
  });
  return output;
}

export function diffOutlinerChangeToCommands(input: {
  document: ZhiJianDocument;
  previousData: OutlineData[];
  nextData: OutlineData[];
  viewState: MutableOutlineViewState;
}): OutlineDiffResult {
  const { document, previousData, nextData } = input;
  let viewState = input.viewState;
  const visibleRootId = viewState.focusNodeId ?? document.rootId;
  const knownSubtreeIds = collectSubtreeIds(document, visibleRootId);
  const knownIds = new Set<NodeId>([...knownSubtreeIds]);
  const previousFlat = flattenOutlinerTree(previousData as OutlinerNode[], visibleRootId);
  const nextFlat = flattenOutlinerTree(nextData as OutlinerNode[], visibleRootId);
  const commands: DocumentCommand[] = [];
  const idReplacements = new Map<string, NodeId>();
  const split = findSplit(document, previousData as OutlinerNode[], nextData as OutlinerNode[], knownIds);

  for (const item of collectUnknownItems(nextData as OutlinerNode[], knownIds)) {
    idReplacements.set(item.id, createId());
  }

  previousFlat.forEach((previous, nodeId) => {
    const next = nextFlat.get(nodeId);
    if (!next || !knownIds.has(nodeId)) return;
    if (previous.expanded !== next.expanded) {
      viewState = setNodeExpanded(viewState, nodeId, next.expanded);
    }
  });

  const deletedIds = new Set<NodeId>();
  knownSubtreeIds.forEach((nodeId) => {
    if (!nextFlat.has(nodeId)) deletedIds.add(nodeId);
  });

  getTopDeletedIds(document, deletedIds).forEach((nodeId) => {
    commands.push(documentCommands.deleteNode(nodeId));
  });

  if (split) {
    const newNodeId = replaceId(split.newItem.id, idReplacements);
    commands.push(documentCommands.splitNode(split.nodeId, split.offset, newNodeId));
  }

  nextFlat.forEach((next, nodeId) => {
    if (!knownIds.has(nodeId)) return;
    if (deletedIds.has(nodeId)) return;
    if (split?.nodeId === nodeId) return;
    const currentNode = document.nodes[nodeId];
    if (currentNode && currentNode.content !== next.topic) {
      commands.push(documentCommands.updateContent(nodeId, next.topic, { mergeKey: `outline-content:${nodeId}` }));
    }
  });

  nextFlat.forEach((next, nodeId) => {
    if (knownIds.has(nodeId)) return;
    if (split?.newItem.id === nodeId) return;
    const newNodeId = replaceId(nodeId, idReplacements);
    const parentId = replaceId(next.parentId, idReplacements);
    commands.push(documentCommands.createNode({
      type: 'createNode',
      parentId,
      index: next.index,
      node: {
        id: newNodeId,
        content: next.topic,
      },
    }));
  });

  nextFlat.forEach((next, nodeId) => {
    if (!knownIds.has(nodeId) || deletedIds.has(nodeId)) return;
    const currentNode = document.nodes[nodeId];
    if (!currentNode) return;
    const nextParentId = replaceId(next.parentId, idReplacements);
    const currentParent = currentNode.parentId ? document.nodes[currentNode.parentId] : null;
    const currentSiblingIndex = currentParent
      ? currentParent.children.filter((childId) => !deletedIds.has(childId)).indexOf(nodeId)
      : -1;
    if (currentNode.parentId !== nextParentId || currentSiblingIndex !== next.index) {
      commands.push(documentCommands.moveNode({
        nodeId,
        parentId: nextParentId,
        index: next.index,
      }));
    }
  });

  return {
    commands,
    viewState,
    idReplacements,
    usedWholeTreeReplace: false,
  };
}
