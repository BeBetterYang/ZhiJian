import {
  createId,
  documentCommands,
  type DocumentCommand,
  type NodeId,
} from '../core';
import {
  getMindMapNodeId,
  isContentBlockType,
  mindMapDataToCreateNodeInput,
  mindMapDataToStyle,
  mindMapDataToTodo,
  mindMapImagesToImages,
  mindMapTableToTable,
  mindMapTextToContent,
} from './mindMapAdapter';
import type { MindMapViewNode, MindMapViewNodeData, ReadonlyZhiJianDocument } from './mindMapTypes';

interface FlatMindMapNode {
  id: NodeId;
  parentId: NodeId | null;
  index: number;
  data: MindMapViewNodeData;
}

export interface MindMapDiffResult {
  commands: DocumentCommand[];
  idReplacements: Map<NodeId, NodeId>;
}

function flattenMindMapData(root: MindMapViewNode): Map<NodeId, FlatMindMapNode> {
  const flat = new Map<NodeId, FlatMindMapNode>();
  const walk = (node: MindMapViewNode, parentId: NodeId | null, index: number) => {
    const id = getMindMapNodeId(node);
    flat.set(id, { id, parentId, index, data: node.data });
    (node.children ?? []).forEach((child, childIndex) => walk(child, id, childIndex));
  };
  walk(root, null, 0);
  return flat;
}

function getTopDeletedIds(document: ReadonlyZhiJianDocument, deletedIds: Set<NodeId>): NodeId[] {
  return [...deletedIds].filter((nodeId) => {
    let parentId = document.nodes[nodeId]?.parentId ?? null;
    while (parentId) {
      if (deletedIds.has(parentId)) return false;
      parentId = document.nodes[parentId]?.parentId ?? null;
    }
    return true;
  });
}

function replaceId(nodeId: NodeId | null, replacements: Map<NodeId, NodeId>): NodeId | null {
  if (nodeId === null) return null;
  return replacements.get(nodeId) ?? nodeId;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export function diffMindMapChangeToCommands(
  document: ReadonlyZhiJianDocument,
  previous: MindMapViewNode,
  next: MindMapViewNode,
  idGenerator: () => NodeId = createId,
): MindMapDiffResult {
  const commands: DocumentCommand[] = [];
  const idReplacements = new Map<NodeId, NodeId>();
  const previousFlat = flattenMindMapData(previous);
  const nextFlat = flattenMindMapData(next);
  const knownIds = new Set(Object.keys(document.nodes));
  const deletedIds = new Set<NodeId>();

  knownIds.forEach((nodeId) => {
    if (nodeId !== document.rootId && !nextFlat.has(nodeId)) deletedIds.add(nodeId);
  });
  getTopDeletedIds(document, deletedIds).forEach((nodeId) => {
    commands.push(documentCommands.deleteNode(nodeId));
  });

  nextFlat.forEach((nextNode, nodeId) => {
    if (knownIds.has(nodeId)) return;
    const newNodeId = idGenerator();
    idReplacements.set(nodeId, newNodeId);
    const parentId = replaceId(nextNode.parentId, idReplacements) ?? document.rootId;
    commands.push(documentCommands.createNode({
      type: 'createNode',
      parentId,
      index: nextNode.index,
      node: mindMapDataToCreateNodeInput(nextNode.data, newNodeId),
    }));
  });

  nextFlat.forEach((nextNode, nodeId) => {
    const resolvedNodeId = replaceId(nodeId, idReplacements) ?? nodeId;
    if (!knownIds.has(nodeId) || deletedIds.has(nodeId)) return;
    const currentNode = document.nodes[resolvedNodeId];
    if (!currentNode) return;

    const nextContent = mindMapTextToContent(nextNode.data.text, nextNode.data.richText);
    if (currentNode.content !== nextContent) {
      commands.push(documentCommands.updateContent(resolvedNodeId, nextContent, {
        mergeKey: `mindmap-content:${resolvedNodeId}`,
      }));
    }

    if (
      resolvedNodeId !== document.rootId
      && isContentBlockType(nextNode.data._blockType)
      && currentNode.blockType !== nextNode.data._blockType
    ) {
      commands.push(documentCommands.setBlockType(resolvedNodeId, nextNode.data._blockType));
    }

    if (resolvedNodeId === document.rootId) return;

    const nextTodo = mindMapDataToTodo(nextNode.data);
    if (!valuesEqual(currentNode.todo, nextTodo)) {
      commands.push(documentCommands.setTodo(resolvedNodeId, nextTodo));
    }

    const nextNote = typeof nextNode.data.note === 'string' ? nextNode.data.note : undefined;
    if (currentNode.note !== nextNote) {
      commands.push(documentCommands.setNote(resolvedNodeId, nextNote));
    }

    const nextImages = mindMapImagesToImages(nextNode.data._images, resolvedNodeId);
    if (!valuesEqual(currentNode.images, nextImages)) {
      commands.push(documentCommands.setImages(resolvedNodeId, nextImages));
    }

    const nextTable = mindMapTableToTable(nextNode.data._table);
    if (!valuesEqual(currentNode.table, nextTable)) {
      commands.push(documentCommands.setTable(resolvedNodeId, nextTable));
    }

    const nextStyle = mindMapDataToStyle(nextNode.data);
    if (!valuesEqual(currentNode.style, nextStyle)) {
      commands.push(documentCommands.setStyle(resolvedNodeId, nextStyle));
    }
  });

  nextFlat.forEach((nextNode, nodeId) => {
    if (!knownIds.has(nodeId) || deletedIds.has(nodeId) || nodeId === document.rootId) return;
    const currentNode = document.nodes[nodeId];
    if (!currentNode) return;
    const nextParentId = replaceId(nextNode.parentId, idReplacements) ?? document.rootId;
    const currentParent = currentNode.parentId ? document.nodes[currentNode.parentId] : null;
    const currentIndex = currentParent ? currentParent.children.filter((childId) => !deletedIds.has(childId)).indexOf(nodeId) : 0;
    if (currentNode.parentId !== nextParentId || currentIndex !== nextNode.index) {
      commands.push(documentCommands.moveNode({
        nodeId,
        parentId: nextParentId,
        index: nextNode.index,
      }));
    }
  });

  previousFlat.forEach((_previousNode, nodeId) => {
    if (nodeId !== document.rootId && !knownIds.has(nodeId) && !nextFlat.has(nodeId)) {
      idReplacements.delete(nodeId);
    }
  });

  return { commands, idReplacements };
}
