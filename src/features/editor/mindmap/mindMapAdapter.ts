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

// ---------------------------------------------------------------------------
// 富文本边界转换
//
// 业务 Store（ZhiJianDocument.nodes[].content）统一保存 Inline Markdown /
// 普通业务文本；SimpleMindMap 节点保存 HTML（data.text + data.richText）。
// contentToMindMapText 负责 Document → SimpleMindMap，
// mindMapTextToContent 负责 SimpleMindMap → Document。
// 两者必须幂等且互为逆，避免同步循环中 HTML 实体层层转义
// （如 "<p>&lt;p&gt;&amp;lt;p&amp;gt;...&lt;/p&gt;"）。
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** 单次 HTML 实体解码（不做 while 无限解码，避免实体无限增长）。 */
function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (match, code: string) => {
      const point = parseInt(code, 16);
      return Number.isNaN(point) || point > 0x10ffff ? match : String.fromCodePoint(point);
    })
    .replace(/&#(\d+);/g, (match, code: string) => {
      const point = Number(code);
      return Number.isNaN(point) || point > 0x10ffff ? match : String.fromCodePoint(point);
    })
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

/**
 * SimpleMindMap → Document：把 SMM 返回的 HTML 文本规范化回内联 Markdown。
 * - `<p>测试</p>` → `测试`
 * - `<p><strong>粗体</strong></p>` → `**粗体**`
 * - `<p><em>斜体</em></p>` → `*斜体*`
 * - `<u>下划线</u>` → `<u>下划线</u>`（保留可表达的下划线格式）
 * - `<s>删除线</s>` → `~~删除线~~`
 */
export function mindMapTextToContent(value: unknown, richText?: unknown): string {
  const text = String(value ?? '');
  if (!text) return '';
  if (richText === false && !/<[a-zA-Z]/.test(text)) return text;
  return htmlToInlineMarkdown(text);
}

function htmlToInlineMarkdown(value: string): string {
  let result = decodeHtmlEntities(value).trim();
  // 去除块级包裹（<p>/<div>），保留内部内容；段落间保留换行
  result = result
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/p>/gi, '\n')
    .replace(/<div[^>]*>/gi, '')
    .replace(/<\/div>/gi, '');
  // 迭代替换行内标签（支持简单嵌套，如 <strong><em>…</em></strong>）
  for (let round = 0; round < 8; round += 1) {
    const before = result;
    result = result
      .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, (_match, inner: string) => `**${inner}**`)
      .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, (_match, inner: string) => `**${inner}**`)
      .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, (_match, inner: string) => `*${inner}*`)
      .replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, (_match, inner: string) => `*${inner}*`)
      .replace(/<s[^>]*>([\s\S]*?)<\/s>/gi, (_match, inner: string) => `~~${inner}~~`)
      .replace(/<strike[^>]*>([\s\S]*?)<\/strike>/gi, (_match, inner: string) => `~~${inner}~~`)
      .replace(/<del[^>]*>([\s\S]*?)<\/del>/gi, (_match, inner: string) => `~~${inner}~~`)
      .replace(/<u[^>]*>([\s\S]*?)<\/u>/gi, (_match, inner: string) => `<u>${inner}</u>`);
    if (result === before) break;
  }
  result = result.replace(/<br\s*\/?>/gi, '\n');
  // 保留 <u> 标签，清理其余未知标签（只保留其文本内容）
  result = result.replace(/<\/?(?!\/?u[^a-zA-Z])[^>]*>/gi, '');
  return result.trim();
}

function inlineMarkdownToHtml(markdown: string): string {
  let result = markdown;
  result = result.replace(/\*\*(?!\s)(.+?)(?<!\s)\*\*/g, '<strong>$1</strong>');
  // 单星号斜体：保守匹配，避免把 "5*5=25" 这类普通文本误判为富文本
  result = result.replace(/(?<![*\w])\*([^*\n]+?)\*(?![\w*])/g, (match, inner) => (
    typeof inner === 'string' && inner.length >= 2 && !/^\d+$/.test(inner) ? `<em>${inner}</em>` : match
  ));
  result = result.replace(/~~(.+?)~~/g, '<s>$1</s>');
  return result;
}

/**
 * Document → SimpleMindMap：把 Store 的内联 Markdown 转成 SMM 的 HTML 文本。
 * 纯文本返回 richText: false，含格式标记返回 richText: true。
 */
export function contentToMindMapText(content: string): { text: string; richText: boolean } {
  if (!content) return { text: '', richText: false };
  const html = inlineMarkdownToHtml(content);
  const hasMarkdownFormat = html !== content;
  const hasHtmlTag = /<[a-zA-Z][^>]*>/.test(content) && content.includes('>');
  if (!hasMarkdownFormat && !hasHtmlTag) return { text: content, richText: false };
  return { text: html, richText: true };
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

function blockTypeToMindMapTypography(blockType: ZhiJianBlockType): Pick<MindMapViewNodeData, 'fontSize' | 'fontWeight'> {
  if (blockType === 'root') return { fontSize: 20, fontWeight: '500' };
  if (blockType === 'heading1') return { fontSize: 19, fontWeight: '600' };
  if (blockType === 'heading2') return { fontSize: 18, fontWeight: '500' };
  if (blockType === 'heading3') return { fontSize: 17, fontWeight: '500' };
  return { fontSize: 16 };
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
    content: mindMapTextToContent(data.text, data.richText),
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
  const { text, richText } = contentToMindMapText(node.content);
  const data: MindMapViewNodeData = {
    uid: node.id,
    id: node.id,
    text,
    richText,
    _blockType: node.blockType,
    note: node.note,
    _images: imagesToMindMapImages(node.images),
    _table: tableToMindMapTable(node.table),
    _clozes: node.clozes,
    expand: undefined,
    ...blockTypeToMindMapTypography(node.blockType),
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
