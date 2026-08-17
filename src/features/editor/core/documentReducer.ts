import { createId, createNode, type NodeId, type ZhiJianDocument, type ZhiJianNode } from './documentTypes';
import type { DocumentCommand } from './documentCommands';
import {
  getNode,
  getNodeIndex,
  getParent,
  getPreviousSiblingId,
  getPreviousVisibleNodeId,
  getSubtreeIds,
  isDescendant,
  replaceNode,
} from './treeUtils';
import { assertValidDocument } from './treeValidation';

function touch(document: ZhiJianDocument, now = Date.now()): ZhiJianDocument {
  return { ...document, updatedAt: now };
}

function withoutChild(parent: ZhiJianNode, nodeId: NodeId): ZhiJianNode {
  return { ...parent, children: parent.children.filter((childId) => childId !== nodeId) };
}

function insertChild(parent: ZhiJianNode, nodeId: NodeId, index = parent.children.length): ZhiJianNode {
  const children = parent.children.filter((childId) => childId !== nodeId);
  const safeIndex = Math.max(0, Math.min(index, children.length));
  children.splice(safeIndex, 0, nodeId);
  return { ...parent, children };
}

function updateNode(document: ZhiJianDocument, nodeId: NodeId, updater: (node: ZhiJianNode) => ZhiJianNode) {
  return replaceNode(document, updater(getNode(document, nodeId)));
}

function applyMoveNode(document: ZhiJianDocument, nodeId: NodeId, parentId: NodeId, index: number): ZhiJianDocument {
  if (nodeId === document.rootId) throw new Error('Root node cannot be moved.');
  if (nodeId === parentId) throw new Error('Node cannot become its own parent.');
  if (isDescendant(document, nodeId, parentId)) throw new Error('Node cannot be moved into its own descendant.');

  const node = getNode(document, nodeId);
  const oldParent = getParent(document, nodeId);
  const nextParent = getNode(document, parentId);
  if (!oldParent) throw new Error('Non-root node must have a parent.');

  let nextDocument = document;
  nextDocument = replaceNode(nextDocument, withoutChild(oldParent, nodeId));
  const adjustedIndex = oldParent.id === nextParent.id && getNodeIndex(document, nodeId) < index ? index - 1 : index;
  const freshParent = getNode(nextDocument, nextParent.id);
  nextDocument = replaceNode(nextDocument, insertChild(freshParent, nodeId, adjustedIndex));
  nextDocument = replaceNode(nextDocument, { ...node, parentId });
  return nextDocument;
}

export function reduceDocument(
  document: ZhiJianDocument,
  command: DocumentCommand,
  options: { validate?: boolean; now?: number } = {},
): ZhiJianDocument {
  let nextDocument = document;

  switch (command.type) {
    case 'createNode': {
      const parent = getNode(document, command.parentId);
      const node = createNode({
        ...(command.node ?? {}),
        id: command.node?.id ?? createId(),
        parentId: parent.id,
      });
      if (document.nodes[node.id]) throw new Error(`Node "${node.id}" already exists.`);
      nextDocument = {
        ...document,
        nodes: {
          ...document.nodes,
          [parent.id]: insertChild(parent, node.id, command.index),
          [node.id]: node,
        },
      };
      break;
    }
    case 'deleteNode': {
      if (command.nodeId === document.rootId) throw new Error('Root node cannot be deleted.');
      const node = getNode(document, command.nodeId);
      const parent = getParent(document, command.nodeId);
      if (!parent) throw new Error('Non-root node must have a parent.');
      const subtreeIds = new Set(getSubtreeIds(document, command.nodeId));
      const nodes = { ...document.nodes };
      for (const nodeId of subtreeIds) delete nodes[nodeId];
      nodes[parent.id] = withoutChild(parent, node.id);
      nextDocument = { ...document, nodes };
      break;
    }
    case 'moveNode':
      nextDocument = applyMoveNode(document, command.nodeId, command.parentId, command.index);
      break;
    case 'updateContent':
      nextDocument = updateNode(document, command.nodeId, (node) => ({ ...node, content: command.content }));
      if (command.nodeId === document.rootId) {
        nextDocument = { ...nextDocument, title: command.content };
      }
      break;
    case 'setBlockType':
      nextDocument = updateNode(document, command.nodeId, (node) => ({ ...node, blockType: command.blockType }));
      break;
    case 'setTodo':
      nextDocument = updateNode(document, command.nodeId, (node) => ({ ...node, todo: command.todo }));
      break;
    case 'toggleTodo':
      nextDocument = updateNode(document, command.nodeId, (node) => ({
        ...node,
        todo: node.todo ? undefined : { enabled: true, checked: false },
      }));
      break;
    case 'setTodoChecked':
      nextDocument = updateNode(document, command.nodeId, (node) => ({
        ...node,
        todo: { enabled: true, checked: command.checked },
      }));
      break;
    case 'setNote':
      nextDocument = updateNode(document, command.nodeId, (node) => ({ ...node, note: command.note }));
      break;
    case 'setImages':
      nextDocument = updateNode(document, command.nodeId, (node) => ({ ...node, images: command.images }));
      break;
    case 'setTable':
      nextDocument = updateNode(document, command.nodeId, (node) => ({ ...node, table: command.table }));
      break;
    case 'setStyle':
      nextDocument = updateNode(document, command.nodeId, (node) => ({ ...node, style: command.style }));
      break;
    case 'splitNode': {
      if (command.nodeId === document.rootId) throw new Error('Root node content cannot be split into siblings.');
      const node = getNode(document, command.nodeId);
      const parent = getParent(document, command.nodeId);
      if (!parent) throw new Error('Non-root node must have a parent.');
      const offset = Math.max(0, Math.min(command.offset, node.content.length));
      const newNode = createNode({
        id: command.newNodeId ?? createId(),
        parentId: parent.id,
        content: node.content.slice(offset),
        blockType: node.blockType,
      });
      nextDocument = replaceNode(document, { ...node, content: node.content.slice(0, offset) });
      const freshParent = getNode(nextDocument, parent.id);
      nextDocument = {
        ...nextDocument,
        nodes: {
          ...nextDocument.nodes,
          [freshParent.id]: insertChild(freshParent, newNode.id, freshParent.children.indexOf(node.id) + 1),
          [newNode.id]: newNode,
        },
      };
      break;
    }
    case 'mergeNode': {
      if (command.nodeId === document.rootId) throw new Error('Root node cannot be merged into another node.');
      const source = getNode(document, command.nodeId);
      const targetId = command.targetNodeId ?? getPreviousVisibleNodeId(document, command.nodeId);
      if (!targetId) throw new Error('No previous node exists for merge.');
      if (targetId === source.id || isDescendant(document, source.id, targetId)) {
        throw new Error('Invalid merge target.');
      }
      const target = getNode(document, targetId);
      nextDocument = replaceNode(document, { ...target, content: `${target.content}${source.content}` });
      const sourceChildren = [...source.children];
      sourceChildren.forEach((childId, offset) => {
        nextDocument = applyMoveNode(nextDocument, childId, target.id, target.children.length + offset);
      });
      nextDocument = reduceDocument(nextDocument, { type: 'deleteNode', nodeId: source.id }, { validate: false });
      break;
    }
    case 'indentNode': {
      if (command.nodeId === document.rootId) throw new Error('Root node cannot be indented.');
      const previousSiblingId = getPreviousSiblingId(document, command.nodeId);
      if (!previousSiblingId) return document;
      const previousSibling = getNode(document, previousSiblingId);
      nextDocument = applyMoveNode(document, command.nodeId, previousSibling.id, previousSibling.children.length);
      break;
    }
    case 'outdentNode': {
      if (command.nodeId === document.rootId) throw new Error('Root node cannot be outdented.');
      const parent = getParent(document, command.nodeId);
      if (!parent || parent.id === document.rootId) return document;
      const grandParent = getParent(document, parent.id);
      if (!grandParent) return document;
      nextDocument = applyMoveNode(document, command.nodeId, grandParent.id, grandParent.children.indexOf(parent.id) + 1);
      break;
    }
    case 'reorderNode': {
      const parent = getParent(document, command.nodeId);
      if (!parent) throw new Error('Root node cannot be reordered.');
      nextDocument = applyMoveNode(document, command.nodeId, parent.id, command.index);
      break;
    }
    default: {
      const exhaustive: never = command;
      throw new Error(`Unsupported command: ${JSON.stringify(exhaustive)}`);
    }
  }

  nextDocument = touch(nextDocument, options.now);
  if (options.validate !== false) assertValidDocument(nextDocument);
  return nextDocument;
}
