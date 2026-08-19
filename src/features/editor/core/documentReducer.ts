import {
  createEmptyTable,
  createId,
  createNode,
  type ContentNode,
  type NodeId,
  type TableNode,
  type ZhiJianContentBlockType,
  type ZhiJianDocument,
  type ZhiJianNode,
} from './documentTypes';
import type { DocumentCommand } from './documentCommands';
import {
  getNode,
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

function requireContentNode(document: ZhiJianDocument, nodeId: NodeId): ContentNode {
  const node = getNode(document, nodeId);
  if (node.kind !== 'content') throw new Error(`Node "${nodeId}" is not a content node.`);
  return node;
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
  const freshParent = getNode(nextDocument, nextParent.id);
  nextDocument = replaceNode(nextDocument, insertChild(freshParent, nodeId, index));
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
    case 'updateContent': {
      const node = requireContentNode(document, command.nodeId);
      nextDocument = replaceNode(document, { ...node, content: command.content });
      if (command.nodeId === document.rootId) {
        nextDocument = { ...nextDocument, title: command.content };
      }
      break;
    }
    case 'setBlockType': {
      if (command.nodeId === document.rootId) throw new Error('Root node block type cannot be changed.');
      const node = requireContentNode(document, command.nodeId);
      nextDocument = replaceNode(document, { ...node, blockType: command.blockType });
      break;
    }
    case 'setTodo': {
      const node = requireContentNode(document, command.nodeId);
      nextDocument = replaceNode(document, { ...node, todo: command.todo });
      break;
    }
    case 'toggleTodo': {
      const node = requireContentNode(document, command.nodeId);
      nextDocument = replaceNode(document, { ...node, todo: node.todo ? undefined : { checked: false } });
      break;
    }
    case 'setTodoChecked': {
      const node = requireContentNode(document, command.nodeId);
      nextDocument = replaceNode(document, { ...node, todo: { checked: command.checked } });
      break;
    }
    case 'setDescription': {
      const node = requireContentNode(document, command.nodeId);
      nextDocument = replaceNode(document, { ...node, description: command.description });
      break;
    }
    case 'removeDescription': {
      const node = requireContentNode(document, command.nodeId);
      if (node.description === undefined) break;
      const next: ContentNode = { ...node };
      delete next.description;
      nextDocument = replaceNode(document, next);
      break;
    }
    case 'setImages': {
      const node = requireContentNode(document, command.nodeId);
      nextDocument = replaceNode(document, { ...node, images: command.images });
      break;
    }
    case 'setStyle': {
      const node = requireContentNode(document, command.nodeId);
      nextDocument = replaceNode(document, { ...node, style: command.style });
      break;
    }
    case 'convertToTable': {
      if (command.nodeId === document.rootId) throw new Error('Root node cannot be converted to a table.');
      const node = getNode(document, command.nodeId);
      const tableNode: TableNode = {
        id: node.id,
        parentId: node.parentId,
        children: node.children,
        kind: 'table',
        table: command.table ?? createEmptyTable(),
      };
      nextDocument = replaceNode(document, tableNode);
      break;
    }
    case 'insertSiblingTable': {
      const node = getNode(document, command.nodeId);
      const parent = getParent(document, command.nodeId);
      if (!parent) throw new Error('Cannot insert a sibling table next to the root node.');
      const tableNode = createNode({
        id: command.newNodeId ?? createId(),
        parentId: parent.id,
        kind: 'table',
        table: command.table,
      });
      if (document.nodes[tableNode.id]) throw new Error(`Node "${tableNode.id}" already exists.`);
      const index = parent.children.indexOf(node.id) + 1;
      nextDocument = {
        ...document,
        nodes: {
          ...document.nodes,
          [parent.id]: insertChild(parent, tableNode.id, index),
          [tableNode.id]: tableNode,
        },
      };
      break;
    }
    case 'updateTable': {
      const node = getNode(document, command.nodeId);
      if (node.kind !== 'table') throw new Error(`Node "${command.nodeId}" is not a table node.`);
      nextDocument = replaceNode(document, { ...node, table: command.table });
      break;
    }
    case 'splitNode': {
      if (command.nodeId === document.rootId) throw new Error('Root node content cannot be split into siblings.');
      const node = requireContentNode(document, command.nodeId);
      const parent = getParent(document, command.nodeId);
      if (!parent) throw new Error('Non-root node must have a parent.');
      const offset = Math.max(0, Math.min(command.offset, node.content.length));
      const blockType = node.blockType as ZhiJianContentBlockType;
      const newNode = createNode({
        id: command.newNodeId ?? createId(),
        parentId: parent.id,
        content: node.content.slice(offset),
        blockType,
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
      const source = requireContentNode(document, command.nodeId);
      const targetId = command.targetNodeId ?? getPreviousVisibleNodeId(document, command.nodeId);
      if (!targetId) throw new Error('No previous node exists for merge.');
      if (targetId === source.id || isDescendant(document, source.id, targetId)) {
        throw new Error('Invalid merge target.');
      }
      const target = getNode(document, targetId);
      if (target.kind !== 'content') throw new Error('Merge target must be a content node.');
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
