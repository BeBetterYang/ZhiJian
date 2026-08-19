export type NodeId = string;

export type ZhiJianContentBlockType = 'text' | 'heading1' | 'heading2' | 'heading3';
export type ZhiJianBlockType = 'root' | ZhiJianContentBlockType;

export type NodeKind = 'content' | 'table';

export interface ZhiJianTodo {
  checked: boolean;
}

export interface ZhiJianImage {
  id: string;
  url: string;
  alt?: string;
  width?: number;
  height?: number;
}

export interface ZhiJianTable {
  rows: string[][];
}

export interface ZhiJianTextRange {
  start: number;
  end: number;
}

export interface ZhiJianNodeStyle {
  color?: string;
  backgroundColor?: string;
}

export interface BaseNode {
  id: NodeId;
  parentId: NodeId | null;
  children: NodeId[];
}

export interface ContentNode extends BaseNode {
  kind: 'content';
  content: string;
  blockType: ZhiJianBlockType;
  description?: string;
  todo?: ZhiJianTodo;
  images?: ZhiJianImage[];
  style?: ZhiJianNodeStyle;
  clozes?: ZhiJianTextRange[];
}

export interface TableNode extends BaseNode {
  kind: 'table';
  table: ZhiJianTable;
}

export type ZhiJianNode = ContentNode | TableNode;

export function isContentNode(node: ZhiJianNode): node is ContentNode {
  return node.kind === 'content';
}

export function isTableNode(node: ZhiJianNode): node is TableNode {
  return node.kind === 'table';
}

/** Content-or-empty accessor for view / serialize code that walks both node kinds. */
export function getNodeContent(node: ZhiJianNode): string {
  return node.kind === 'content' ? node.content : '';
}

/** Block type accessor that defaults table nodes to plain text for layout purposes. */
export function getNodeBlockType(node: ZhiJianNode): ZhiJianBlockType {
  return node.kind === 'content' ? node.blockType : 'text';
}

export interface ZhiJianDocument {
  schemaVersion: 1;
  id: string;
  title: string;
  rootId: NodeId;
  nodes: Record<NodeId, ZhiJianNode>;
  createdAt: number;
  updatedAt: number;
}

export interface CreateDocumentOptions {
  id?: string;
  rootId?: NodeId;
  title?: string;
  now?: number;
}

export interface CreateNodeInput {
  id?: NodeId;
  kind?: NodeKind;
  content?: string;
  blockType?: ZhiJianContentBlockType;
  description?: string;
  todo?: ZhiJianTodo;
  images?: ZhiJianImage[];
  table?: ZhiJianTable;
  style?: ZhiJianNodeStyle;
  clozes?: ZhiJianTextRange[];
}

export type IdGenerator = () => string;

export const DEFAULT_DOCUMENT_TITLE = '新手入门';

export function createEmptyTable(rows = 2, columns = 2): ZhiJianTable {
  return {
    rows: Array.from({ length: Math.max(1, rows) }, () =>
      Array.from({ length: Math.max(1, columns) }, () => '')),
  };
}

export function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `zj-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function createDocument(options: CreateDocumentOptions = {}): ZhiJianDocument {
  const now = options.now ?? Date.now();
  const id = options.id ?? createId();
  const rootId = options.rootId ?? createId();
  const title = options.title ?? DEFAULT_DOCUMENT_TITLE;

  const root: ContentNode = {
    id: rootId,
    parentId: null,
    children: [],
    kind: 'content',
    content: title,
    blockType: 'root',
  };

  return {
    schemaVersion: 1,
    id,
    title,
    rootId,
    nodes: {
      [rootId]: root,
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function createNode(input: CreateNodeInput & { id: NodeId; parentId: NodeId | null }): ZhiJianNode {
  if (input.kind === 'table') {
    const table: TableNode = {
      id: input.id,
      parentId: input.parentId,
      children: [],
      kind: 'table',
      table: input.table ?? createEmptyTable(),
    };
    return table;
  }

  const node: ContentNode = {
    id: input.id,
    parentId: input.parentId,
    children: [],
    kind: 'content',
    content: input.content ?? '',
    blockType: input.blockType ?? 'text',
    description: input.description,
    todo: input.todo,
    images: input.images,
    style: input.style,
    clozes: input.clozes,
  };
  return node;
}

export function cloneDocument(document: ZhiJianDocument): ZhiJianDocument {
  return structuredClone(document);
}
