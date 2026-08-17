import type {
  NodeId,
  ZhiJianBlockType,
  ZhiJianImage,
  ZhiJianNode,
  ZhiJianNodeStyle,
  ZhiJianTextRange,
  ZhiJianTodo,
} from '../core';

export interface MindMapViewImage {
  id?: string;
  url: string;
  title?: string;
  alt?: string;
  width?: number;
  height?: number;
}

export interface MindMapViewTable {
  rows: number;
  columns: number;
  cells: string[][];
}

export interface MindMapViewNodeData {
  [key: string]: unknown;
  uid: NodeId;
  id: NodeId;
  text: string;
  richText: boolean;
  _blockType: ZhiJianBlockType;
  _todo?: boolean;
  _todoChecked?: boolean;
  note?: string;
  _images?: MindMapViewImage[];
  _table?: MindMapViewTable;
  color?: string;
  fillColor?: string;
  fontSize?: number;
  fontWeight?: string;
  _clozes?: ZhiJianNode['clozes'];
  expand?: boolean;
}

export interface MindMapViewNode {
  data: MindMapViewNodeData;
  children?: MindMapViewNode[];
  smmVersion?: string;
}

export type SimpleMindMapRendererNode = MindMapViewNode;

interface ReadonlyZhiJianTable {
  readonly rows: readonly (readonly string[])[];
}

export interface ReadonlyZhiJianNode extends Omit<Readonly<ZhiJianNode>, 'children' | 'todo' | 'images' | 'table' | 'style' | 'clozes'> {
  readonly children: readonly NodeId[];
  readonly todo?: Readonly<ZhiJianTodo>;
  readonly images?: readonly Readonly<ZhiJianImage>[];
  readonly table?: ReadonlyZhiJianTable;
  readonly style?: Readonly<ZhiJianNodeStyle>;
  readonly clozes?: readonly Readonly<ZhiJianTextRange>[];
}

export interface ReadonlyZhiJianDocument {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly title: string;
  readonly rootId: NodeId;
  readonly nodes: Readonly<Record<NodeId, ReadonlyZhiJianNode>>;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface MindMapViewState {
  scale?: number;
  x?: number;
  y?: number;
  selectedNodeIds?: NodeId[];
  expandedIds?: Set<NodeId>;
}
