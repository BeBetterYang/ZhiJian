export type NodeId = string;

export type ZhiJianBlockType = 'text' | 'heading1' | 'heading2' | 'heading3';

export interface ZhiJianTodo {
  enabled: boolean;
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

export interface ZhiJianNode {
  id: NodeId;
  parentId: NodeId | null;
  children: NodeId[];
  content: string;
  blockType: ZhiJianBlockType;
  todo?: ZhiJianTodo;
  note?: string;
  images?: ZhiJianImage[];
  table?: ZhiJianTable;
  style?: ZhiJianNodeStyle;
  clozes?: ZhiJianTextRange[];
}

export interface ZhiJianDocument {
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
  content?: string;
  blockType?: ZhiJianBlockType;
  todo?: ZhiJianTodo;
  note?: string;
  images?: ZhiJianImage[];
  table?: ZhiJianTable;
  style?: ZhiJianNodeStyle;
  clozes?: ZhiJianTextRange[];
}

export type IdGenerator = () => string;

export const DEFAULT_DOCUMENT_TITLE = '新手入门';

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

  return {
    id,
    title,
    rootId,
    nodes: {
      [rootId]: {
        id: rootId,
        parentId: null,
        children: [],
        content: title,
        blockType: 'heading2',
      },
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function createNode(input: CreateNodeInput & { id: NodeId; parentId: NodeId | null }): ZhiJianNode {
  return {
    id: input.id,
    parentId: input.parentId,
    children: [],
    content: input.content ?? '',
    blockType: input.blockType ?? 'text',
    todo: input.todo,
    note: input.note,
    images: input.images,
    table: input.table,
    style: input.style,
    clozes: input.clozes,
  };
}

export function cloneDocument(document: ZhiJianDocument): ZhiJianDocument {
  return structuredClone(document);
}
