import type {
  NodeId,
  ZhiJianBlockType,
  ZhiJianContentBlockType,
  ZhiJianImage,
  ZhiJianNodeStyle,
  ZhiJianTable,
  ZhiJianTodo,
} from '../core';
import type {
  MindMapViewImage,
  MindMapViewNode,
  MindMapViewNodeData,
  MindMapViewState,
  MindMapViewTable,
  ReadonlyZhiJianDocument,
} from './mindMapTypes';

export function isContentBlockType(value: unknown): value is ZhiJianContentBlockType {
  return value === 'text' || value === 'heading1' || value === 'heading2' || value === 'heading3';
}

export function isZhiJianBlockType(value: unknown): value is ZhiJianBlockType {
  return value === 'root' || isContentBlockType(value);
}

export function mindMapTextToContent(value: unknown): string {
  return String(value ?? '');
}

export function tableToMindMapTable(table?: { readonly rows: readonly (readonly string[])[] }): MindMapViewTable | undefined {
  if (!table) return undefined;
  const cells = table.rows.map((row) => [...row]);
  return {
    rows: cells.length,
    columns: Math.max(0, ...cells.map((row) => row.length)),
    cells,
  };
}

export function mindMapTableToTable(table: unknown): ZhiJianTable | undefined {
  if (!table || typeof table !== 'object') return undefined;
  const candidate = table as Partial<MindMapViewTable>;
  if (!Array.isArray(candidate.cells)) return undefined;
  return {
    rows: candidate.cells.map((row) => Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : []),
  };
}

export function imagesToMindMapImages(images?: readonly Readonly<ZhiJianImage>[]): MindMapViewImage[] | undefined {
  return images?.map((image) => ({
    id: image.id,
    url: image.url,
    title: image.alt,
    alt: image.alt,
    width: image.width,
    height: image.height,
  }));
}

export function mindMapImagesToImages(images: unknown, nodeId: NodeId): ZhiJianImage[] | undefined {
  if (!Array.isArray(images)) return undefined;
  return images
    .filter((image): image is MindMapViewImage => Boolean(image && typeof image === 'object' && typeof (image as MindMapViewImage).url === 'string'))
    .map((image, index) => ({
      id: image.id || `${nodeId}:image:${index}`,
      url: image.url,
      alt: image.alt || image.title,
      width: image.width,
      height: image.height,
    }));
}

export function nodeStyleToMindMapData(style?: Readonly<ZhiJianNodeStyle>): Pick<MindMapViewNodeData, 'color' | 'fillColor'> {
  return {
    color: style?.color,
    fillColor: style?.backgroundColor,
  };
}

export function mindMapDataToStyle(data: MindMapViewNodeData): ZhiJianNodeStyle | undefined {
  const style: ZhiJianNodeStyle = {};
  if (typeof data.color === 'string' && data.color) style.color = data.color;
  if (typeof data.fillColor === 'string' && data.fillColor) style.backgroundColor = data.fillColor;
  return Object.keys(style).length > 0 ? style : undefined;
}

export function todoToMindMapData(todo?: Readonly<ZhiJianTodo>): Pick<MindMapViewNodeData, '_todo' | '_todoChecked'> {
  return {
    _todo: todo?.enabled,
    _todoChecked: todo?.checked,
  };
}

export function mindMapDataToTodo(data: MindMapViewNodeData): ZhiJianTodo | undefined {
  if (!data._todo) return undefined;
  return {
    enabled: true,
    checked: Boolean(data._todoChecked),
  };
}

export function mindMapDataToCreateNodeInput(data: MindMapViewNodeData, nodeId: NodeId) {
  const blockType = isContentBlockType(data._blockType) ? data._blockType : 'text';
  return {
    id: nodeId,
    content: mindMapTextToContent(data.text),
    blockType,
    todo: mindMapDataToTodo(data),
    note: typeof data.note === 'string' ? data.note : undefined,
    images: mindMapImagesToImages(data._images, nodeId),
    table: mindMapTableToTable(data._table),
    style: mindMapDataToStyle(data),
    clozes: data._clozes,
  };
}

export function zhiJianNodeToMindMapNode(
  document: ReadonlyZhiJianDocument,
  nodeId: NodeId,
  viewState?: MindMapViewState,
): MindMapViewNode {
  const node = document.nodes[nodeId];
  if (!node) throw new Error(`Node "${nodeId}" does not exist.`);
  const expanded = viewState?.expandedIds ? viewState.expandedIds.has(nodeId) : true;
  const data: MindMapViewNodeData = {
    uid: node.id,
    id: node.id,
    text: node.content,
    richText: false,
    _blockType: node.blockType,
    note: node.note,
    _images: imagesToMindMapImages(node.images),
    _table: tableToMindMapTable(node.table),
    _clozes: node.clozes,
    expand: undefined,
    ...todoToMindMapData(node.todo),
    ...nodeStyleToMindMapData(node.style),
  } as MindMapViewNodeData;
  const children = node.children.map((childId) => zhiJianNodeToMindMapNode(document, childId, viewState));
  if (node.children.length > 0) {
    return { data: { ...data, expand: expanded } as MindMapViewNodeData, children };
  }
  return { data, children };
}

export function documentToMindMapData(
  document: ReadonlyZhiJianDocument,
  viewState?: MindMapViewState,
): MindMapViewNode {
  return zhiJianNodeToMindMapNode(document, document.rootId, viewState);
}

export function getMindMapNodeId(node: MindMapViewNode): NodeId {
  return node.data.uid || node.data.id;
}

export function cloneMindMapData(data: MindMapViewNode): MindMapViewNode {
  return structuredClone(data);
}
