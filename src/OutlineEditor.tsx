import { useCallback, useMemo } from 'react';
import { Outliner, type OutlineData } from 'react-outliner-neo';
import 'react-outliner-neo/style.css';
import { marked } from 'marked';

export type OutlineNode = {
  data: Record<string, unknown> & { text?: string; richText?: boolean; expand?: boolean };
  children?: OutlineNode[];
  smmVersion?: string;
};

type Props = {
  data: OutlineNode;
  onChange: (data: OutlineNode) => void;
};

type OutlinerItem = OutlineData & { children?: OutlinerItem[] };

const createId = () => `outline-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
const pathId = (path: number[]) => `outline-path-${path.join('-') || 'root'}`;

function stripHtml(value: unknown) {
  const source = String(value ?? '');
  if (!source) return '';
  if (typeof document === 'undefined') {
    return source.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
  }
  const container = document.createElement('div');
  container.innerHTML = source;
  return (container.textContent ?? '').trim();
}

function htmlToMarkdown(value: unknown) {
  const source = String(value ?? '');
  if (!source) return '';
  if (typeof document === 'undefined') return stripHtml(source);
  const container = document.createElement('div');
  container.innerHTML = source;
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (!(node instanceof HTMLElement)) return '';
    const content = Array.from(node.childNodes).map(walk).join('');
    const tag = node.tagName.toLowerCase();
    if (tag === 'strong' || tag === 'b') return `**${content}**`;
    if (tag === 'em' || tag === 'i') return `*${content}*`;
    if (tag === 'u') return `<u>${content}</u>`;
    if (tag === 'br') return '\n';
    if (tag === 'p' || tag === 'div') return content;
    return content;
  };
  return Array.from(container.childNodes).map(walk).join('').trim();
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function markdownInlineToHtml(value: string) {
  const underlines: string[] = [];
  const protectedValue = value.replace(/<u>([\s\S]*?)<\/u>/gi, (_, content: string) => {
    const index = underlines.push(escapeHtml(content)) - 1;
    return `@@OUTLINE_UNDERLINE_${index}@@`;
  });
  return escapeHtml(protectedValue)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/@@OUTLINE_UNDERLINE_(\d+)@@/g, (_, index: string) => `<u>${underlines[Number(index)]}</u>`);
}

function getNodeId(node: OutlineNode, path: number[]) {
  return String(node.data._outlineId || pathId(path));
}

function collectNodesById(nodes: OutlineNode[], path: number[] = [], map = new Map<string, OutlineNode>()) {
  nodes.forEach((node, index) => {
    const childPath = [...path, index];
    map.set(getNodeId(node, childPath), node);
    collectNodesById(node.children ?? [], childPath, map);
  });
  return map;
}

function toOutlinerItem(node: OutlineNode, fallbackTopic = '新主题', path: number[] = []): OutlinerItem {
  return {
    id: getNodeId(node, path),
    topic: htmlToMarkdown(node.data.text) || fallbackTopic,
    expanded: node.data.expand !== false,
    children: (node.children ?? []).map((child, index) => toOutlinerItem(child, '', [...path, index])),
  };
}

function toOutlineNode(item: OutlinerItem, previousNodes: Map<string, OutlineNode>): OutlineNode {
  const previous = previousNodes.get(item.id);
  const children = (item.children ?? []).map((child) => toOutlineNode(child, previousNodes));
  const topic = item.topic || '新主题';

  return {
    data: {
      ...(previous?.data ?? {}),
      _outlineId: item.id,
      text: markdownInlineToHtml(topic),
      richText: /[*_<]/.test(topic),
      expand: item.expanded !== false,
    },
    children,
  };
}

export default function OutlineEditor({ data, onChange }: Props) {
  const outlinerData = useMemo<OutlineData[]>(() => {
    return data.children?.length
      ? data.children.map((child, index) => toOutlinerItem(child, '', [index]))
      : [{ id: createId(), topic: '', children: [], expanded: true }];
  }, [data]);

  const handleChange = useCallback((items: OutlinerItem[]) => {
    const previousNodes = collectNodesById(data.children ?? []);
    onChange({
      ...data,
      children: items.map((item) => toOutlineNode(item, previousNodes)),
    });
  }, [data, onChange]);

  const renderMarkdown = useCallback((text: string) => {
    return marked.parseInline(text, { async: false }) as string;
  }, []);

  return (
    <div className="outline-editor outliner-neo-shell">
      <div className="outliner-neo-title">{stripHtml(data.data.text) || '未命名导图'}</div>
      <Outliner
        data={outlinerData}
        onChange={handleChange}
        markdown={renderMarkdown}
        readonly={false}
        i18n={{
          menuTitle: '主题操作',
          outdent: '提升层级',
          indent: '降低层级',
          delete: '删除主题',
          zoomIn: '聚焦主题',
          untitled: '新主题',
          dragToMove: '拖动排序',
          zoomInAndDrag: '聚焦 / 拖动',
        }}
      />
    </div>
  );
}
