import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import {
  Button,
  Checkbox,
  ColorPicker,
  Divider,
  Drawer,
  Dropdown,
  Input,
  Menu,
  Message,
  Modal,
  Popover,
  Radio,
  Space,
  Spin,
  Switch,
  Tooltip,
  Upload,
} from '@arco-design/web-react';
import {
  IconApps,
  IconBranch,
  IconCheck,
  IconClockCircle,
  IconCommon,
  IconDownload,
  IconInfoCircle,
  IconImport,
  IconLink,
  IconMenu,
  IconMinus,
  IconPalette,
  IconPlus,
  IconRedo,
  IconQuote,
  IconShareAlt,
  IconUndo,
  IconZoomIn,
  IconZoomOut,
} from '@arco-design/web-react/icon';
import MindMap, { type MindMapNode } from 'simple-mind-map';
import Drag from 'simple-mind-map/src/plugins/Drag.js';
import SelectPlugin from 'simple-mind-map/src/plugins/Select.js';
import ExportPlugin from 'simple-mind-map/src/plugins/Export.js';
import AssociativeLine from 'simple-mind-map/src/plugins/AssociativeLine.js';
import NodeImgAdjust from 'simple-mind-map/src/plugins/NodeImgAdjust.js';
import RichText from 'simple-mind-map/src/plugins/RichText.js';
import OutlineEditor from './OutlineEditor';
import type { LegacyMindMapNode as OutlineNode } from './legacyMindMapTypes';
import {
  createDocument,
  createDocumentStore,
  documentCommands,
  type DocumentStore,
} from './features/editor/core';
import SharedEditorToolbar from './SharedEditorToolbar';
import EditableNodeTable, { type EditableTableData } from './EditableNodeTable';
import EditableImageGallery from './EditableImageGallery';
import EditableAnnotation from './EditableAnnotation';
import { applyInlineColor } from './richTextSelection';
import { loadServerJson, saveServerJson, uploadServerImage } from './serverStorage';
import {
  normalizeMarkdownBoldHtml,
  normalizeMindMapMarkdownFormatting,
  parseMindMapMarkdown,
  serializeMindMapMarkdown,
} from './mindMapMarkdown';
import { TUTORIAL_MAP_ID, tutorialMindMapData } from './tutorialData';

const pluginRegistrar = MindMap.usePlugin;
pluginRegistrar(Drag);
pluginRegistrar(SelectPlugin);
pluginRegistrar(ExportPlugin);
pluginRegistrar(AssociativeLine);
pluginRegistrar(NodeImgAdjust);
pluginRegistrar(RichText);

type EditorProps = {
  mapId: string;
  title: string;
  toolbarTarget?: HTMLElement | null;
  defaultViewMode?: ViewMode;
  focusNodeText?: string;
  onTitleChange?: (title: string) => void;
};

type ViewMode = 'mindmap' | 'outline';

type TableData = EditableTableData;

type NodeImageData = {
  url: string;
  title?: string;
  width?: number;
  height?: number;
};

type RichTextFormat = Record<string, string | boolean | undefined>;

type RichTextController = {
  formatText: (config?: Record<string, string | boolean>, clear?: boolean) => void;
  lastRange?: { index: number; length: number } | null;
  range?: { index: number; length: number } | null;
  showTextEdit?: boolean;
};

type MindMapWithRichText = MindMap & {
  richText?: RichTextController;
};

type MindMapWithServerRenderer = MindMap & {
  renderer: MindMap['renderer'] & { setData: (data: OutlineNode) => void };
};

type EventfulMindMap = MindMap & {
  emit: (eventName: string, ...args: unknown[]) => void;
};

type ActivatableMindMapNode = MindMapNode & {
  active: () => void;
};

type StyledMindMapNode = MindMapNode & {
  getStyle: (prop: string) => unknown;
};

type ThemeAwareMindMap = MindMap & {
  themeConfig?: { backgroundColor?: string };
};

function getNodeStyleValue(node: MindMapNode, prop: string, fallback: string) {
  const value = (node as StyledMindMapNode).getStyle?.(prop);
  return typeof value === 'string' && value ? value : fallback;
}

function getCanvasBackground(node: MindMapNode) {
  const value = (node.mindMap as ThemeAwareMindMap).themeConfig?.backgroundColor;
  return typeof value === 'string' && value ? value : '#fff';
}

type FloatingTitleEditorState = {
  top: number;
  left: number;
  minWidth: number;
  maxWidth: number;
  background: string;
  color: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  fontStyle: string;
  lineHeight: string;
  textDecoration: string;
};

type MindMapViewData = {
  transform: Record<string, unknown>;
  state: {
    scale: number;
    x: number;
    y: number;
    sx: number;
    sy: number;
  };
};

type MindMapViewController = {
  setScale: (scale: number) => void;
  setTransformData: (viewData: MindMapViewData) => void;
  getTransformData: () => MindMapViewData;
  translateXTo: (x: number) => void;
  translateYTo: (y: number) => void;
};

type PositionedMindMapNode = MindMapNode & {
  left: number;
  top: number;
  width: number;
  height: number;
  children?: MindMapNode[];
};

type SearchHighlightableMindMapNode = MindMapNode & {
  highlight: () => void;
  closeHighlight: () => void;
};

type NodeContextMenuState = {
  node: MindMapNode;
  top: number;
  left: number;
};

type ClipboardRenderer = MindMap['renderer'] & {
  copy: () => void;
  cut: () => void;
  paste: () => Promise<void>;
};

type TextEditableRenderer = MindMap['renderer'] & {
  activeNodeList: MindMapNode[];
  renderByCustomNodeContentNode: (node: MindMapNode) => void;
  textEdit: {
    show: (options: { node: MindMapNode; e?: MouseEvent }) => void | Promise<void>;
    getBackground: (node: MindMapNode) => string;
  };
};

type CustomNodeTextSelection = {
  node: MindMapNode;
  element: HTMLElement;
  range: Range;
  formats: RichTextFormat;
  commit?: (html: string) => void;
};

const shortcutSections = [
  {
    title: '文字颜色',
    items: [
      ['默认', ['Alt', 'D']], ['红色', ['Alt', 'R']], ['黄色', ['Alt', 'Y']],
      ['绿色', ['Alt', 'G']], ['蓝色', ['Alt', 'B']], ['紫色', ['Alt', 'P']],
    ],
  },
  {
    title: '高亮',
    items: [
      ['黄色', ['Ctrl', 'Alt', 'Y']], ['红色', ['Ctrl', 'Alt', 'R']], ['灰色', ['Ctrl', 'Alt', 'H']],
      ['绿色', ['Ctrl', 'Alt', 'G']], ['蓝色', ['Ctrl', 'Alt', 'B']], ['粉色', ['Ctrl', 'Alt', 'P']], ['青色', ['Ctrl', 'Alt', 'C']],
    ],
  },
  {
    title: '主题操作',
    items: [
      ['添加/删除待办', ['Ctrl', 'Shift', 'L']], ['待办完成/取消完成', ['Ctrl', 'Shift', 'K']],
      ['添加表格', ['Ctrl', 'Alt', 'T']], ['进入/退出描述区', ['Shift', 'Enter']],
      ['展开/折叠节点', ['Ctrl', '.']], ['创建副本', ['Ctrl', 'D']], ['打开全局搜索', ['Ctrl', 'Shift', 'F']],
    ],
  },
] as const;

const CUSTOM_NODE_TEXT_SELECTION_EVENT = 'custom_node_text_selection_change';
const CUSTOM_NODE_DESCRIPTION_EVENT = 'custom_node_description_open';

function insertEditableLineBreak(editor: HTMLElement) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return;
  range.deleteContents();
  const breakElement = document.createElement('br');
  range.insertNode(breakElement);
  range.setStartAfter(breakElement);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

const EXPORT_CUSTOM_NODE_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  .mind-map-attachment-root { width: max-content; max-width: none; }
  .mind-map-attachment-node { display: flex; width: max-content; max-width: none; padding: 5px 15px; box-sizing: border-box; align-items: flex-start; flex-direction: column; color: inherit; font-family: inherit; font-size: 12px; }
  .mind-map-attachment-title { display: flex; width: 100%; min-height: 22px; align-items: center; gap: 6px; font-size: 14px; font-weight: 400; line-height: 1.2; white-space: normal; }
  .mind-map-attachment-title-text { display: block; min-width: 0; flex: 1 1 auto; white-space: pre-wrap; overflow-wrap: anywhere; }
  .mind-map-attachment-title-text strong, .mind-map-attachment-title-text b,
  .editable-annotation-content strong, .editable-annotation-content b,
  .editable-node-table strong, .editable-node-table b,
  .smm-richtext-node-wrap strong, .smm-richtext-node-wrap b { font-weight: 700 !important; }
  .editable-annotation { width: 100%; margin-top: 5px; padding-left: 7px; border-left: 1px solid currentColor; color: inherit; }
  .editable-annotation-content { min-width: 36px; min-height: 1.5em; color: inherit; font-family: inherit; font-weight: 400; line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; }
  .mind-map-attachment-node .editable-annotation { width: max-content; max-width: 508px; }
  .mind-map-attachment-node .editable-annotation-content { width: max-content; max-width: 500px; }
  .mind-map-image-grid { display: flex; width: 100%; max-width: 100%; margin-top: 5px; flex-wrap: wrap; gap: 6px; }
  .editable-node-image { position: relative; display: inline-flex; flex: 0 0 auto; }
  .editable-node-image .arco-image { display: inline-block; overflow: hidden; }
  .editable-node-image img { display: block; object-fit: cover; }
  .mind-map-table-wrap { position: relative; width: 100%; max-width: none; margin-top: 5px; overflow: visible; }
  .editable-node-table table { width: max-content; min-width: 320px; max-width: none; border-collapse: collapse; background: transparent; table-layout: auto; }
  .editable-node-table.mind-map-table-wrap table { min-width: max(320px, 100%); }
  .editable-node-table th, .editable-node-table td { width: auto; min-width: 96px; max-width: 288px; height: 30px; padding: 5px 8px; border: 1px solid #c9cdd4; background: transparent; color: inherit; font: inherit; font-weight: 400; line-height: 1.5; text-align: left; vertical-align: middle; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
  .editable-node-image-delete, .editable-table-delete, .editable-table-column-menu, .editable-table-row-menu { display: none !important; }
`;

const STORAGE_PREFIX = 'zhijian-map-';
const VIEW_STORAGE_PREFIX = 'zhijian-map-view-';
const DISPLAY_MODE_STORAGE_PREFIX = 'zhijian-map-display-mode-';
const DEFAULT_PREFERENCES_STORAGE_KEY = 'zhijian-default-map-preferences';
const layouts = [
  { label: '思维导图', value: 'mindMap', group: '思维导图', description: '中心向两侧展开' },
  { label: '逻辑图', value: 'logicalStructure', group: '逻辑图', description: '从左向右推演' },
  { label: '目录组织图', value: 'catalogOrganization', group: '逻辑图', description: '目录式层级排列' },
  { label: '组织结构图', value: 'organizationStructure', group: '组织结构图', description: '从上向下分层' },
  { label: '时间轴', value: 'timeline', group: '时序与分析', description: '按时间顺序展开' },
  { label: '鱼骨图', value: 'fishbone', group: '时序与分析', description: '用于因果拆解' },
] as const;

type LayoutValue = typeof layouts[number]['value'];
type ConnectionLineStyleKey = 'orthogonal' | 'rounded' | 'curve' | 'direct';
type NodeBorderShape = 'rounded' | 'square';

const connectionLineStyles = [
  { value: 'orthogonal', label: '直角', description: '清晰规整', lineStyle: 'straight', lineRadius: 0, supportedLayouts: layouts.map((item) => item.value) },
  { value: 'rounded', label: '圆角', description: '柔和转折', lineStyle: 'straight', lineRadius: 8, supportedLayouts: layouts.map((item) => item.value) },
  { value: 'curve', label: '曲线', description: '流畅自然', lineStyle: 'curve', lineRadius: 8, supportedLayouts: ['mindMap', 'logicalStructure'] },
  { value: 'direct', label: '直连', description: '节点直达', lineStyle: 'direct', lineRadius: 0, supportedLayouts: ['mindMap', 'logicalStructure', 'organizationStructure'] },
] as const;

function getLayoutIcon(value: LayoutValue) {
  switch (value) {
    case 'mindMap': return <IconShareAlt />;
    case 'logicalStructure': return <IconBranch />;
    case 'catalogOrganization': return <IconMenu />;
    case 'organizationStructure': return <IconApps />;
    case 'timeline': return <IconClockCircle />;
    case 'fishbone': return <IconCommon />;
  }
}

function isLineStyleSupported(
  style: typeof connectionLineStyles[number],
  layout: LayoutValue,
) {
  return (style.supportedLayouts as readonly string[]).includes(layout);
}

const createMubuTheme = (
  label: string,
  group: '简约' | '浅色' | '深色',
  backgroundColor: string,
  lineColor: string,
  color: string,
  accent: string,
  soft: string,
) => ({
  label,
  group,
  swatches: [lineColor, accent, soft],
  preview: label === '纯境' ? 'lines' : label === '明线' ? 'outline' : 'fill',
  config: {
    backgroundColor,
    lineColor,
    generalizationLineColor: lineColor,
    nodeUseLineStyle: false,
    root: { fillColor: 'transparent', borderColor: 'transparent', borderWidth: 0, color, fontSize: 18, fontWeight: 'normal', borderRadius: 0 },
    second: { fillColor: 'transparent', borderColor: 'transparent', borderWidth: 0, color, borderRadius: 0 },
    node: { fillColor: 'transparent', borderColor: 'transparent', borderWidth: 0, color, borderRadius: 0 },
    generalization: { fillColor: 'transparent', borderColor: lineColor, color, borderRadius: 0 },
  },
});

const themes = {
  pure: createMubuTheme('纯境', '简约', '#ffffff', '#c6c6c6', '#303133', '#d8d8d8', '#eeeeee'),
  bright: createMubuTheme('明线', '简约', '#ffffff', '#454545', '#2e3033', '#bfc0c2', '#e6e6e6'),
  plain: createMubuTheme('素页', '简约', '#f3f3f3', '#454545', '#303236', '#c4c5c7', '#e2e2e2'),
  ink: createMubuTheme('墨稿', '浅色', '#f1f2f5', '#414347', '#32343a', '#dfe1e6', '#eceef2'),
  parchment: createMubuTheme('雁皮', '浅色', '#f8f6f2', '#998b78', '#6f6255', '#d7cfc3', '#ede8e1'),
  mist: createMubuTheme('薄雾', '浅色', '#f1f5fa', '#7087a6', '#52637d', '#d4dce7', '#e5eaf1'),
  breeze: createMubuTheme('清风', '浅色', '#f5faf6', '#49b84f', '#328d3a', '#cfead2', '#e7f4e9'),
  pulse: createMubuTheme('脉搏', '浅色', '#fff7f3', '#ed7e42', '#d65d26', '#f7d3c0', '#fce8de'),
  voyage: createMubuTheme('远航', '浅色', '#f1f8fd', '#2796e8', '#147bc4', '#c8e4f7', '#e0f0fa'),
  focus: createMubuTheme('焦点', '深色', '#1f1f21', '#d0d1d3', '#f1f1f2', '#5b5c60', '#35363a'),
  deep: createMubuTheme('深潜', '深色', '#10121d', '#899bd0', '#dbe1f3', '#34415f', '#20283d'),
  night: createMubuTheme('夜图', '深色', '#171018', '#a284ba', '#eadff0', '#432d4d', '#2c2031'),
  forest: createMubuTheme('秘林', '深色', '#08110c', '#72b78d', '#d8eee0', '#274235', '#17281f'),
  volcano: createMubuTheme('火山', '深色', '#130e0c', '#d49079', '#f1ded7', '#503127', '#2d1d18'),
  lake: createMubuTheme('梦湖', '深色', '#071312', '#58aaa3', '#d6eeec', '#244440', '#142b29'),
};

type ThemeKey = keyof typeof themes;

type DefaultMapPreferences = {
  layout: LayoutValue;
  lineStyle: ConnectionLineStyleKey;
  showNodeBorder: boolean;
  nodeBorderShape: NodeBorderShape;
  theme: ThemeKey;
  backgroundColor: string;
};

const fallbackDefaultPreferences: DefaultMapPreferences = {
  layout: 'mindMap',
  lineStyle: 'rounded',
  showNodeBorder: false,
  nodeBorderShape: 'square',
  theme: 'pure',
  backgroundColor: '',
};

function readDefaultMapPreferences(): DefaultMapPreferences {
  try {
    const value = localStorage.getItem(DEFAULT_PREFERENCES_STORAGE_KEY);
    if (!value) return fallbackDefaultPreferences;
    const stored = JSON.parse(value) as Partial<DefaultMapPreferences>;
    return {
      layout: layouts.some((item) => item.value === stored.layout) ? stored.layout as LayoutValue : fallbackDefaultPreferences.layout,
      lineStyle: connectionLineStyles.some((item) => item.value === stored.lineStyle)
        ? stored.lineStyle as ConnectionLineStyleKey
        : fallbackDefaultPreferences.lineStyle,
      showNodeBorder: typeof stored.showNodeBorder === 'boolean' ? stored.showNodeBorder : fallbackDefaultPreferences.showNodeBorder,
      nodeBorderShape: stored.nodeBorderShape === 'rounded' || stored.nodeBorderShape === 'square'
        ? stored.nodeBorderShape
        : fallbackDefaultPreferences.nodeBorderShape,
      theme: stored.theme && stored.theme in themes ? stored.theme as ThemeKey : fallbackDefaultPreferences.theme,
      backgroundColor: typeof stored.backgroundColor === 'string' ? stored.backgroundColor : fallbackDefaultPreferences.backgroundColor,
    };
  } catch {
    return fallbackDefaultPreferences;
  }
}

function saveDefaultMapPreferences(preferences: Partial<DefaultMapPreferences>) {
  localStorage.setItem(
    DEFAULT_PREFERENCES_STORAGE_KEY,
    JSON.stringify({ ...readDefaultMapPreferences(), ...preferences }),
  );
}

function getThemeConfig(
  theme: ThemeKey,
  backgroundColor: string,
  showNodeBorder: boolean,
  nodeBorderShape: NodeBorderShape,
  connectionLineStyle: ConnectionLineStyleKey,
) {
  const config = themes[theme].config;
  const selectedLineStyle = connectionLineStyles.find((item) => item.value === connectionLineStyle) ?? connectionLineStyles[1];
  const border = {
    borderColor: showNodeBorder ? config.lineColor : 'transparent',
    borderWidth: showNodeBorder ? 1 : 0,
    borderRadius: nodeBorderShape === 'rounded' ? 6 : 0,
  };
  const rootBorder = {
    borderColor: config.lineColor,
    borderWidth: 1,
    borderRadius: nodeBorderShape === 'rounded' ? 6 : 0,
  };
  return {
    ...config,
    backgroundColor: backgroundColor || config.backgroundColor,
    lineStyle: selectedLineStyle.lineStyle,
    lineRadius: selectedLineStyle.lineRadius,
    // Custom theme configs are partial. Keep the library's cubic curve behavior
    // for root-to-first-level branches instead of falling back to a quadratic
    // curve when this option is omitted.
    rootLineKeepSameInCurve: true,
    root: { ...config.root, ...rootBorder },
    second: { ...config.second, ...border },
    node: { ...config.node, ...border },
  };
}

function readMapPreferences(data: OutlineNode) {
  const defaults = readDefaultMapPreferences();
  const storedLayout = String(data.data._layout || defaults.layout);
  const storedTheme = String(data.data._theme || defaults.theme);
  const storedLineStyle = String(data.data._lineStyle || defaults.lineStyle);
  return {
    layout: (layouts.some((item) => item.value === storedLayout) ? storedLayout : defaults.layout) as LayoutValue,
    theme: (storedTheme in themes ? storedTheme : defaults.theme) as ThemeKey,
    backgroundColor: typeof data.data._backgroundColor === 'string' ? data.data._backgroundColor : defaults.backgroundColor,
    showNodeBorder: data.data._showNodeBorder === undefined
      ? defaults.showNodeBorder
      : data.data._showNodeBorder === true || data.data._showNodeBorder === 'true',
    nodeBorderShape: data.data._nodeBorderShape === 'rounded' || data.data._nodeBorderShape === 'square'
      ? data.data._nodeBorderShape
      : defaults.nodeBorderShape,
    lineStyle: (connectionLineStyles.some((item) => item.value === storedLineStyle) ? storedLineStyle : defaults.lineStyle) as ConnectionLineStyleKey,
  };
}

function applyCurveRootLineOverride(data: OutlineNode, lineStyle: ConnectionLineStyleKey) {
  const selectedStyle = connectionLineStyles.find((item) => item.value === lineStyle) ?? connectionLineStyles[1];
  data.data.lineStyle = lineStyle === 'curve' ? 'straight' : selectedStyle.lineStyle;
  return data;
}

function createInitialData(title: string) {
  return {
    data: { text: title || '未命名导图', expand: true },
    children: [],
  };
}

function createCustomNodeContent(node: MindMapNode) {
  const tableData = node.getData('_table') as TableData | undefined;
  if (!tableData) return null;

  const container = document.createElement('div');
  container.className = 'mind-map-table-node';
  container.style.width = `${tableData.columns * 92}px`;
  const title = document.createElement('div');
  title.className = 'mind-map-table-title';
  const todoCheckbox = createTodoCheckbox(node);
  if (todoCheckbox) title.appendChild(todoCheckbox);
  const titleText = document.createElement('span');
  titleText.textContent = String(node.getData('text') || '');
  title.appendChild(titleText);
  const table = document.createElement('table');
  const tbody = document.createElement('tbody');

  tableData.cells.forEach((row, rowIndex) => {
    const tr = document.createElement('tr');
    row.forEach((value, columnIndex) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      cell.contentEditable = 'true';
      cell.tabIndex = 0;
      cell.setAttribute('aria-label', `第 ${rowIndex + 1} 行，第 ${columnIndex + 1} 列`);
      cell.addEventListener('mousedown', (event) => event.stopPropagation());
      cell.addEventListener('click', (event) => event.stopPropagation());
      cell.addEventListener('dblclick', (event) => event.stopPropagation());
      cell.addEventListener('keydown', (event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          cell.blur();
        }
      });
      cell.addEventListener('blur', () => {
        const nextTable: TableData = {
          ...tableData,
          cells: tableData.cells.map((item) => [...item]),
        };
        nextTable.cells[rowIndex][columnIndex] = cell.textContent || '';
        node.mindMap.execCommand('SET_NODE_DATA', node, { _table: nextTable });
      });
      tr.appendChild(cell);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.appendChild(title);
  container.appendChild(table);
  return container;
}

function getNodeImages(node: MindMapNode): NodeImageData[] {
  const stored = node.getData('_images');
  const images = Array.isArray(stored)
    ? stored.filter((item): item is NodeImageData => Boolean(item && typeof item === 'object' && typeof item.url === 'string'))
    : [];
  const legacyImage = node.getData('image');
  if (typeof legacyImage === 'string' && legacyImage && !images.some((item) => item.url === legacyImage)) {
    const legacySize = node.getData('imageSize') as { width?: number; height?: number } | undefined;
    images.unshift({
      url: legacyImage,
      title: String(node.getData('imageTitle') || ''),
      width: legacySize?.width,
      height: legacySize?.height,
    });
  }
  return images;
}

function normalizeTable(table: TableData): TableData {
  const cells = table.cells.map((row) => row.map((value) => /^(列 \d+|内容 \d+-\d+)$/.test(value) ? '' : value));
  return { rows: cells.length, columns: cells[0]?.length ?? 0, cells };
}

function MindMapNodeContent({ node, table, images }: { node: MindMapNode; table?: TableData; images: NodeImageData[] }) {
  const [tableState, setTableState] = useState(table);
  const [annotationVisible, setAnnotationVisible] = useState(Boolean(node.getData('_annotationEnabled')));
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const wasActiveOnPointerDownRef = useRef(false);
  const pointerStartRef = useRef({ x: 0, y: 0, moved: false });
  const attachmentRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLDivElement | null>(null);
  const titleTextRef = useRef<HTMLSpanElement | null>(null);
  const floatingTitleRef = useRef<HTMLDivElement | null>(null);
  const editingTitleHtmlRef = useRef('');
  const refreshNodeAfterTitleEditRef = useRef(false);
  const [floatingTitleEditor, setFloatingTitleEditor] = useState<FloatingTitleEditorState | null>(null);
  const text = String(node.getData('text') || '');
  const richText = Boolean(node.getData('richText') || /<[^>]+>/.test(text));
  const customTextWidth = Number(node.getData('customTextWidth')) || 0;
  const annotation = String(node.getData('_annotation') || '');
  const annotationFontSize = Math.max(10, Number(node.getData('fontSize') || 14) - 1);
  const nodeTextColor = getNodeStyleValue(node, 'color', '#303133');
  const titleStyle: CSSProperties = {
    color: nodeTextColor,
    fontWeight: node.getData('fontWeight') === 'bold' ? 700 : 400,
    fontStyle: node.getData('fontStyle') === 'italic' ? 'italic' : 'normal',
    textDecoration: String(node.getData('textDecoration') || 'none'),
    maxWidth: 'none',
  };

  const syncAttachmentSize = useCallback(() => {
    const attachment = attachmentRef.current;
    const title = titleRef.current;
    const titleText = title?.querySelector<HTMLElement>('.mind-map-attachment-title-text');
    if (!attachment || !title || !titleText) return;

    const titleMeasure = title.cloneNode(true) as HTMLDivElement;
    const titleTextMeasure = titleMeasure.querySelector<HTMLElement>('.mind-map-attachment-title-text');
    Object.assign(titleMeasure.style, {
      position: 'fixed',
      top: '0',
      left: '-10000px',
      width: 'max-content',
      maxWidth: 'none',
      visibility: 'hidden',
      pointerEvents: 'none',
    });
    if (titleTextMeasure) {
      titleTextMeasure.style.width = customTextWidth > 0 ? `${customTextWidth}px` : 'max-content';
      titleTextMeasure.style.maxWidth = `${customTextWidth > 0 ? customTextWidth : 500}px`;
      titleTextMeasure.style.flex = 'none';
    }
    document.body.appendChild(titleMeasure);
    const titleWidth = Math.ceil(titleMeasure.getBoundingClientRect().width);
    titleMeasure.remove();

    const tableElement = attachment.querySelector<HTMLTableElement>('.mind-map-table-wrap table');
    let tableWidth = 0;
    if (tableElement) {
      const tableMeasureWrap = document.createElement('div');
      const tableMeasure = tableElement.cloneNode(true) as HTMLTableElement;
      tableMeasureWrap.className = 'mind-map-table-wrap editable-node-table';
      Object.assign(tableMeasureWrap.style, {
        position: 'fixed',
        top: '0',
        left: '-10000px',
        width: 'max-content',
        maxWidth: 'none',
        visibility: 'hidden',
        pointerEvents: 'none',
      });
      tableMeasure.style.width = 'max-content';
      tableMeasure.style.maxWidth = 'none';
      tableMeasureWrap.appendChild(tableMeasure);
      document.body.appendChild(tableMeasureWrap);
      tableWidth = Math.ceil(tableMeasure.getBoundingClientRect().width);
      tableMeasureWrap.remove();
    }
    const visibleImageCount = Math.min(images.length, 3);
    const imageWidth = visibleImageCount > 0 ? visibleImageCount * 92 + (visibleImageCount - 1) * 6 : 0;
    const annotationElement = attachment.querySelector<HTMLElement>('.editable-annotation');
    let annotationWidth = 0;
    if (annotationElement) {
      const annotationMeasure = annotationElement.cloneNode(true) as HTMLElement;
      Object.assign(annotationMeasure.style, {
        position: 'fixed',
        top: '0',
        left: '-10000px',
        width: 'max-content',
        minWidth: '0',
        maxWidth: '508px',
        visibility: 'hidden',
        pointerEvents: 'none',
      });
      document.body.appendChild(annotationMeasure);
      annotationWidth = Math.ceil(annotationMeasure.getBoundingClientRect().width);
      annotationMeasure.remove();
    }
    const contentWidth = Math.max(36, titleWidth, tableWidth, imageWidth, annotationWidth);

    attachment.style.width = `${contentWidth + 30}px`;
  }, [customTextWidth, images.length]);

  useLayoutEffect(() => {
    syncAttachmentSize();
  }, [annotation, annotationVisible, syncAttachmentSize, tableState, text]);

  useLayoutEffect(() => {
    const editor = floatingTitleRef.current;
    if (!floatingTitleEditor || !editor) return;
    editor.innerHTML = editingTitleHtmlRef.current;
    editor.focus({ preventScroll: true });
    const range = document.createRange();
    const selection = window.getSelection();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [floatingTitleEditor]);

  const updateTable = (nextTable: EditableTableData) => {
    const formattedTable = {
      ...nextTable,
      cells: nextTable.cells.map((row) => row.map((cell) => normalizeMarkdownBoldHtml(cell))),
    };
    flushSync(() => setTableState(formattedTable));
    node.mindMap.execCommand('SET_NODE_DATA', node, { _table: formattedTable });
    window.requestAnimationFrame(() => node.mindMap.render());
  };

  const removeImage = (index: number) => {
    const nextImages = images.filter((_, imageIndex) => imageIndex !== index);
    node.mindMap.execCommand('SET_NODE_DATA', node, {
      _images: nextImages,
      image: null,
      imageTitle: '',
      imageSize: null,
    });
    node.mindMap.render();
  };

  const activateNode = () => {
    if (!node.getData('isActive')) (node as ActivatableMindMapNode).active();
  };
  const canBeginAttachmentEdit = () => wasActiveOnPointerDownRef.current && !pointerStartRef.current.moved;
  const beginTitleEdit = () => {
    activateNode();
    const element = titleTextRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const computed = window.getComputedStyle(element);
    const foreignObject = element.closest('foreignObject');
    const foreignRect = foreignObject?.getBoundingClientRect();
    const foreignWidth = Number(foreignObject?.getAttribute('width')) || foreignRect?.width || 1;
    const viewScale = foreignRect ? foreignRect.width / foreignWidth : 1;
    const fontSize = Number.parseFloat(computed.fontSize) || 14;
    const lineHeight = Number.parseFloat(computed.lineHeight) || fontSize * 1.2;
    editingTitleHtmlRef.current = element.innerHTML;
    flushSync(() => {
      setIsTitleEditing(true);
      setFloatingTitleEditor({
        top: rect.top,
        left: rect.left,
        minWidth: Math.max(36, rect.width),
        maxWidth: 500 * viewScale,
        background: getCanvasBackground(node),
        color: computed.color,
        fontFamily: computed.fontFamily,
        fontSize: `${fontSize * viewScale}px`,
        fontWeight: computed.fontWeight,
        fontStyle: computed.fontStyle,
        lineHeight: `${lineHeight * viewScale}px`,
        textDecoration: computed.textDecoration,
      });
    });
  };
  const reportTextSelection = (element: HTMLElement, commit?: (html: string) => void) => {
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!selection || !range || selection.isCollapsed || !element.contains(range.commonAncestorContainer)) {
      (node.mindMap as EventfulMindMap).emit(CUSTOM_NODE_TEXT_SELECTION_EVENT, null);
      return;
    }
    (node.mindMap as EventfulMindMap).emit(CUSTOM_NODE_TEXT_SELECTION_EVENT, {
      node,
      element,
      range: range.cloneRange(),
      commit,
      formats: {
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strike: document.queryCommandState('strikeThrough'),
        color: document.queryCommandValue('foreColor') || undefined,
        background: document.queryCommandValue('backColor') || undefined,
      },
    } satisfies CustomNodeTextSelection);
  };
  const finishTitleEdit = (html: string) => {
    const nextText = normalizeMarkdownBoldHtml(html);
    const shouldRefreshNode = refreshNodeAfterTitleEditRef.current;
    refreshNodeAfterTitleEditRef.current = false;
    editingTitleHtmlRef.current = nextText;
    if (titleTextRef.current) titleTextRef.current.innerHTML = nextText;
    setFloatingTitleEditor(null);
    setIsTitleEditing(false);
    if (nextText !== text) {
      node.mindMap.execCommand('SET_NODE_DATA', node, { text: nextText, richText: true });
    }
    if (nextText !== text || shouldRefreshNode) {
      window.requestAnimationFrame(() => {
        const renderer = node.mindMap.renderer as TextEditableRenderer;
        renderer.renderByCustomNodeContentNode(node);
      });
    }
    (node.mindMap as EventfulMindMap).emit(CUSTOM_NODE_TEXT_SELECTION_EVENT, null);
  };

  return (
    <div
      className={`mind-map-attachment-node${tableState ? ' has-table' : ''}`}
      ref={attachmentRef}
      style={{ color: nodeTextColor }}
      onMouseDownCapture={(event) => {
        wasActiveOnPointerDownRef.current = Boolean(node.getData('isActive'));
        pointerStartRef.current = { x: event.clientX, y: event.clientY, moved: false };
        activateNode();
      }}
      onMouseMoveCapture={(event) => {
        if (!event.buttons) return;
        const start = pointerStartRef.current;
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) start.moved = true;
      }}
    >
      <div className="mind-map-attachment-title" ref={titleRef}>
        {Boolean(node.getData('_todo')) && (
          <Checkbox
            aria-label="完成待办"
            checked={Boolean(node.getData('_todoChecked'))}
            onChange={(checked) => {
              node.mindMap.execCommand('SET_NODE_DATA', node, {
                _todoChecked: checked,
                color: checked ? '#86909c' : (node.getData('_todoOriginalColor') || ''),
                textDecoration: checked ? 'line-through' : (node.getData('_todoOriginalTextDecoration') || 'none'),
              });
            }}
          />
        )}
        <span
          ref={titleTextRef}
          className={`mind-map-attachment-title-text${isTitleEditing ? ' is-editing' : ''}${node.getData('_todoChecked') ? ' is-done' : ''}`}
          style={{ ...titleStyle, visibility: floatingTitleEditor ? 'hidden' : undefined }}
          contentEditable={false}
          suppressContentEditableWarning
          tabIndex={-1}
          onClick={(event) => {
            event.stopPropagation();
            if (!isTitleEditing && canBeginAttachmentEdit()) beginTitleEdit();
          }}
          onDoubleClick={(event) => {
            event.stopPropagation();
            beginTitleEdit();
          }}
          {...(richText ? { dangerouslySetInnerHTML: { __html: text } } : { children: text })}
        />
        {Boolean(node.getData('note')) && (
          <Tooltip content="节点描述">
            <Button
              className="mind-map-node-description-button"
              type="text"
              size="mini"
              aria-label="打开节点描述"
              icon={<IconInfoCircle />}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                activateNode();
                (node.mindMap as EventfulMindMap).emit(CUSTOM_NODE_DESCRIPTION_EVENT, node);
              }}
            />
          </Tooltip>
        )}
      </div>
      {floatingTitleEditor && createPortal(
        <div
          ref={floatingTitleRef}
          className="mind-map-title-floating-editor mind-map-floating-editor"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label="节点标题"
          style={{
            position: 'fixed',
            top: floatingTitleEditor.top,
            left: floatingTitleEditor.left,
            zIndex: 12000,
            width: 'max-content',
            minWidth: floatingTitleEditor.minWidth,
            maxWidth: floatingTitleEditor.maxWidth,
            minHeight: '1.2em',
            padding: 0,
            border: 0,
            outline: 'none',
            background: floatingTitleEditor.background,
            boxShadow: 'none',
            color: floatingTitleEditor.color,
            fontFamily: floatingTitleEditor.fontFamily,
            fontSize: floatingTitleEditor.fontSize,
            fontWeight: floatingTitleEditor.fontWeight,
            fontStyle: floatingTitleEditor.fontStyle,
            lineHeight: floatingTitleEditor.lineHeight,
            textDecoration: floatingTitleEditor.textDecoration,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
          }}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            const key = event.key.toLowerCase();
            const command = event.ctrlKey || event.metaKey;
            const isFormattingShortcut = (command && ['b', 'i', 'u', 'enter'].includes(key))
              || (event.altKey && ['d', 'r', 'y', 'g', 'b', 'p', 'h', 'c'].includes(key));
            if (!isFormattingShortcut) event.stopPropagation();
            if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
              event.currentTarget.blur();
              return;
            }
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (event.shiftKey) {
                insertEditableLineBreak(event.currentTarget);
                editingTitleHtmlRef.current = event.currentTarget.innerHTML;
              } else {
                event.currentTarget.blur();
              }
            }
            if (event.key === 'Tab' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.blur();
              window.requestAnimationFrame(() => {
                node.mindMap.execCommand(event.shiftKey ? 'INSERT_PARENT_NODE' : 'INSERT_CHILD_NODE', true, [node]);
              });
            }
          }}
          onInput={(event) => { editingTitleHtmlRef.current = event.currentTarget.innerHTML; }}
          onPointerUp={(event) => reportTextSelection(event.currentTarget, (html) => {
            event.currentTarget.innerHTML = html;
            editingTitleHtmlRef.current = html;
          })}
          onKeyUp={(event) => reportTextSelection(event.currentTarget, (html) => {
            event.currentTarget.innerHTML = html;
            editingTitleHtmlRef.current = html;
          })}
          onBlur={(event) => finishTitleEdit(event.currentTarget.innerHTML)}
        />,
        document.body,
      )}
      {annotationVisible && (
        <EditableAnnotation
          value={annotation}
          autoFocus={!annotation}
          useFloatingEditor
          requireActivation
          canEditOnClick={canBeginAttachmentEdit}
          floatingBackground={getCanvasBackground(node)}
          style={{ color: nodeTextColor, fontSize: annotationFontSize }}
          onFocus={activateNode}
          onDeleteEmpty={() => {
            refreshNodeAfterTitleEditRef.current = true;
            flushSync(() => setAnnotationVisible(false));
            node.mindMap.execCommand('SET_NODE_DATA', node, { _annotationEnabled: false, _annotation: '' });
            window.requestAnimationFrame(() => {
              syncAttachmentSize();
              beginTitleEdit();
            });
          }}
          onChange={(value) => {
            node.mindMap.execCommand('SET_NODE_DATA', node, { _annotation: normalizeMarkdownBoldHtml(value) });
            window.requestAnimationFrame(() => node.mindMap.render());
          }}
        />
      )}
      {images.length > 0 && (
        <EditableImageGallery
          images={images}
          className="mind-map-image-grid"
          width={92}
          height={68}
          onRemove={removeImage}
        />
      )}
      {tableState && tableState.cells.length > 0 && (
        <EditableNodeTable
          className="mind-map-table-wrap"
          value={tableState}
          useFloatingEditor
          requireActivation
          canEditOnClick={canBeginAttachmentEdit}
          floatingBackground={getCanvasBackground(node)}
          onChange={updateTable}
          onDelete={() => {
            flushSync(() => setTableState(undefined));
            node.mindMap.execCommand('SET_NODE_DATA', node, { _table: null });
            node.mindMap.render();
          }}
          onTextSelection={(element, row, column) => reportTextSelection(element, (html) => {
            const nextTable = {
              ...tableState,
              cells: tableState.cells.map((cells) => [...cells]),
            };
            nextTable.cells[row][column] = html;
            updateTable(nextTable);
          })}
        />
      )}
    </div>
  );
}

function createAttachmentNodeContent(node: MindMapNode) {
  const rawTable = node.getData('_table') as TableData | undefined;
  const table = rawTable?.cells?.length ? normalizeTable(rawTable) : undefined;
  const images = getNodeImages(node);
  if (!table && images.length === 0 && !node.getData('_annotationEnabled')) return createCustomNodeContent(node);

  const container = document.createElement('div');
  container.className = 'mind-map-attachment-root';
  container.style.width = 'max-content';
  container.style.maxWidth = 'none';
  const root = createRoot(container);
  flushSync(() => root.render(<MindMapNodeContent node={node} table={table} images={images} />));
  return container;
}

function createTodoCheckbox(node: MindMapNode) {
  if (!node.getData('_todo')) return null;
  const checkbox = document.createElement('input');
  checkbox.className = 'mind-map-todo-input';
  checkbox.type = 'checkbox';
  checkbox.checked = Boolean(node.getData('_todoChecked'));
  checkbox.setAttribute('aria-label', '完成待办');
  ['mousedown', 'click', 'dblclick'].forEach((eventName) => {
    checkbox.addEventListener(eventName, (event) => event.stopPropagation());
  });
  checkbox.addEventListener('change', () => {
    const checked = checkbox.checked;
    node.mindMap.execCommand('SET_NODE_DATA', node, {
      _todoChecked: checked,
      color: checked ? '#86909c' : (node.getData('_todoOriginalColor') || ''),
      textDecoration: checked ? 'line-through' : (node.getData('_todoOriginalTextDecoration') || 'none'),
    });
    node.mindMap.render();
  });
  return checkbox;
}

function createTodoPrefixContent(node: MindMapNode) {
  const checkbox = createTodoCheckbox(node);
  if (!checkbox) return null;

  const wrapper = document.createElement('span');
  wrapper.className = 'mind-map-todo-control';
  wrapper.appendChild(checkbox);
  return { el: wrapper, width: 18, height: 18 };
}

function readStoredData(mapId: string, title: string) {
  try {
    const value = localStorage.getItem(`${STORAGE_PREFIX}${mapId}`);
    const initialData = mapId === TUTORIAL_MAP_ID ? tutorialMindMapData : createInitialData(title);
    return normalizeMindMapMarkdownFormatting(value ? JSON.parse(value) : JSON.parse(JSON.stringify(initialData)));
  } catch {
    const initialData = mapId === TUTORIAL_MAP_ID ? tutorialMindMapData : createInitialData(title);
    return normalizeMindMapMarkdownFormatting(JSON.parse(JSON.stringify(initialData)));
  }
}

function createEditorDocumentStore(mapId: string, title: string): DocumentStore {
  const document = createDocument({
    id: mapId,
    title: title || '未命名',
  });
  const store = createDocumentStore(document);
  store.execute(documentCommands.createNode({
    type: 'createNode',
    parentId: document.rootId,
    node: {
      content: '',
    },
  }), { recordHistory: false });
  return store;
}

function readStoredDisplayMode(mapId: string, fallback: ViewMode) {
  const value = localStorage.getItem(`${DISPLAY_MODE_STORAGE_PREFIX}${mapId}`);
  return value === 'outline' || value === 'mindmap' ? value : fallback;
}

function isMindMapViewData(value: unknown): value is MindMapViewData {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<MindMapViewData>;
  const state = candidate.state;
  return Boolean(
    candidate.transform
    && typeof candidate.transform === 'object'
    && state
    && Number.isFinite(state.scale)
    && state.scale > 0
    && Number.isFinite(state.x)
    && Number.isFinite(state.y)
    && Number.isFinite(state.sx)
    && Number.isFinite(state.sy)
  );
}

function readStoredViewData(mapId: string) {
  try {
    const value = localStorage.getItem(`${VIEW_STORAGE_PREFIX}${mapId}`);
    const parsed: unknown = value ? JSON.parse(value) : null;
    return isMindMapViewData(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getPlainTitle(value: unknown) {
  const container = document.createElement('div');
  container.innerHTML = String(value ?? '');
  return (container.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function exportMarkdown(data: OutlineNode, name: string) {
  const blob = new Blob([serializeMindMapMarkdown(data)], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name}.md`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function MindMapEditor({
  mapId,
  title,
  toolbarTarget,
  focusNodeText,
  defaultViewMode = 'mindmap',
  onTitleChange,
}: EditorProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const mindMapRef = useRef<MindMap | null>(null);
  const renderedLayoutRef = useRef('');
  const [mode, setMode] = useState<ViewMode>(() => readStoredDisplayMode(mapId, defaultViewMode));
  const [layout, setLayout] = useState<LayoutValue>('mindMap');
  const [theme, setTheme] = useState<ThemeKey>('pure');
  const [backgroundColor, setBackgroundColor] = useState('');
  const [showNodeBorder, setShowNodeBorder] = useState(false);
  const [nodeBorderShape, setNodeBorderShape] = useState<NodeBorderShape>('square');
  const [connectionLineStyle, setConnectionLineStyle] = useState<ConnectionLineStyleKey>('rounded');
  const [readyMapId, setReadyMapId] = useState('');
  const mapReady = readyMapId === mapId;
  const [activeNode, setActiveNode] = useState<MindMapNode | null>(null);
  const [activeNodes, setActiveNodes] = useState<MindMapNode[]>([]);
  const [documentStore] = useState<DocumentStore>(() => createEditorDocumentStore(mapId, title));
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [descriptionNode, setDescriptionNode] = useState<MindMapNode | null>(null);
  const [tableOpen, setTableOpen] = useState(false);
  const [tableSize, setTableSize] = useState({ rows: 3, columns: 3 });
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [hasTextSelection, setHasTextSelection] = useState(false);
  const [richTextFormat, setRichTextFormat] = useState<RichTextFormat>({});
  const [nodeContextMenu, setNodeContextMenu] = useState<NodeContextMenuState | null>(null);
  const storageWarningShownRef = useRef(false);
  const serverSaveTimerRef = useRef<number | null>(null);
  const serverReadyRef = useRef(false);
  const customTextSelectionRef = useRef<CustomNodeTextSelection | null>(null);
  const onTitleChangeRef = useRef(onTitleChange);
  const initialTitleRef = useRef(title);

  useEffect(() => {
    onTitleChangeRef.current = onTitleChange;
  }, [onTitleChange]);

  useEffect(() => {
    let previousTitle = documentStore.getDocument().title;
    return documentStore.subscribe(() => {
      const nextDocument = documentStore.getDocument();
      if (nextDocument.title === previousTitle) return;
      previousTitle = nextDocument.title;
      onTitleChangeRef.current?.(nextDocument.title);
    });
  }, [documentStore]);

  const undo = () => {
    if (mode !== 'outline') {
      mindMapRef.current?.execCommand('BACK');
      return;
    }
    documentStore.undo();
  };

  const redo = () => {
    if (mode !== 'outline') {
      mindMapRef.current?.execCommand('FORWARD');
      return;
    }
    documentStore.redo();
  };

  const hasActiveNode = activeNodes.length > 0;
  const hasSelection = activeNodes.length > 0;
  const currentThemeConfig = useMemo(
    () => getThemeConfig(theme, backgroundColor, showNodeBorder, nodeBorderShape, connectionLineStyle),
    [backgroundColor, connectionLineStyle, nodeBorderShape, showNodeBorder, theme],
  );

  useEffect(() => {
    const el = canvasRef.current;
    if (!el || mindMapRef.current) return;
    const initialData = readStoredData(mapId, initialTitleRef.current);
    const initialViewData = readStoredViewData(mapId);
    const initialPreferences = readMapPreferences(initialData);
    applyCurveRootLineOverride(initialData, initialPreferences.lineStyle);
    renderedLayoutRef.current = initialPreferences.layout;
    setLayout(initialPreferences.layout);
    setTheme(initialPreferences.theme);
    setBackgroundColor(initialPreferences.backgroundColor);
    setShowNodeBorder(initialPreferences.showNodeBorder);
    setNodeBorderShape(initialPreferences.nodeBorderShape);
    setConnectionLineStyle(initialPreferences.lineStyle);

    const instance = new MindMap({
      el,
      data: initialData,
      viewData: initialViewData,
      layout: initialPreferences.layout,
      theme: 'default',
      themeConfig: getThemeConfig(
        initialPreferences.theme,
        initialPreferences.backgroundColor,
        initialPreferences.showNodeBorder,
        initialPreferences.nodeBorderShape,
        initialPreferences.lineStyle,
      ),
      fit: false,
      enableFreeDrag: false,
      isShowExpandNum: true,
      alwaysShowExpandBtn: false,
      defaultInsertSecondLevelNodeText: '新主题',
      defaultInsertBelowSecondLevelNodeText: '新主题',
      mousewheelAction: 'move',
      isEndNodeTextEditOnClickOuter: false,
      isUseCustomNodeContent: true,
      customCreateNodeContent: createAttachmentNodeContent,
      createNodePrefixContent: createTodoPrefixContent,
      resetCss: EXPORT_CUSTOM_NODE_CSS,
      errorHandler: (_type: string, error: unknown) => {
        console.error(error);
        Message.error('导图操作失败，请重试');
      },
    });

    // simple-mind-map falls back to white when a transparent node enters edit mode.
    // Keep both its plain-text and rich-text editors on the actual canvas background.
    (instance.renderer as TextEditableRenderer).textEdit.getBackground = getCanvasBackground;

    let viewPersistenceReady = false;

    const handleActive = (...args: unknown[]) => {
      const nodes = Array.isArray(args[1]) ? args[1] as MindMapNode[] : [];
      setActiveNodes(nodes);
      const selected = nodes[0] ?? null;
      setActiveNode(selected);
      customTextSelectionRef.current = null;
      setHasTextSelection(false);
      setRichTextFormat({});
    };
    const handleScale = (value: unknown) => {
      setZoom(Math.round(Number(value || 1) * 100));
    };
    const handleViewDataChange = (...args: unknown[]) => {
      const viewData = args[0];
      if (!isMindMapViewData(viewData)) return;
      if (!viewPersistenceReady) return;
      try {
        localStorage.setItem(`${VIEW_STORAGE_PREFIX}${mapId}`, JSON.stringify(viewData));
      } catch {
        // View state is a convenience preference; map content saving takes priority.
      }
    };
    const handleRichTextSelection = (...args: unknown[]) => {
      setHasTextSelection(Boolean(args[0]));
      setRichTextFormat(args[2] && typeof args[2] === 'object' ? args[2] as RichTextFormat : {});
    };
    const handleNodeTextEditChange = (...args: unknown[]) => {
      const change = args[0] as { node?: MindMapNode; text?: string } | undefined;
      if (!change?.node || typeof change.text !== 'string') return;
      const formattedText = normalizeMarkdownBoldHtml(change.text);
      if (formattedText !== change.text) {
        change.node.mindMap.execCommand('SET_NODE_DATA', change.node, { text: formattedText, richText: true });
      }
    };
    const handleCustomTextSelection = (...args: unknown[]) => {
      const selection = args[0] as CustomNodeTextSelection | null;
      customTextSelectionRef.current = selection;
      setHasTextSelection(Boolean(selection));
      setRichTextFormat(selection?.formats ?? {});
    };
    const handleOpenNodeDescription = (...args: unknown[]) => {
      const node = args[0] as MindMapNode | undefined;
      if (!node) return;
      if (!node.getData('isActive')) (node as ActivatableMindMapNode).active();
      setDescriptionNode(node);
      setDescription(String(node.getData('note') || ''));
      setDescriptionOpen(true);
    };
    const handleNodeContextMenu = (...args: unknown[]) => {
      const event = args[0] as MouseEvent | undefined;
      const node = args[1] as MindMapNode | undefined;
      if (!event || !node) return;
      setNodeContextMenu({
        node,
        left: Math.max(8, Math.min(event.clientX, window.innerWidth - 260)),
        top: Math.max(8, Math.min(event.clientY, window.innerHeight - 470)),
      });
    };
    let plainNodePointer: { node: MindMapNode; x: number; y: number; moved: boolean } | null = null;
    const handlePlainNodeMouseDown = (...args: unknown[]) => {
      const node = args[0] as MindMapNode | undefined;
      const event = args[1] as MouseEvent | undefined;
      if (!node || !event || event.button !== 0) return;
      plainNodePointer = { node, x: event.clientX, y: event.clientY, moved: false };
    };
    const trackPlainNodePointer = (event: MouseEvent) => {
      if (!plainNodePointer || !event.buttons) return;
      if (Math.hypot(event.clientX - plainNodePointer.x, event.clientY - plainNodePointer.y) > 4) {
        plainNodePointer.moved = true;
      }
    };
    const handlePlainNodeClick = (...args: unknown[]) => {
      const node = args[0] as (MindMapNode & { isUseCustomNodeContent?: () => boolean }) | undefined;
      const event = args[1] as MouseEvent | undefined;
      const renderer = instance.renderer as TextEditableRenderer;
      const pointer = plainNodePointer;
      plainNodePointer = null;
      if (
        !node
        || !event
        || event.button !== 0
        || event.ctrlKey
        || event.metaKey
        || node.isUseCustomNodeContent?.()
        || pointer?.node !== node
        || pointer.moved
        || !node.getData('isActive')
        || renderer.activeNodeList.length !== 1
      ) return;
      void renderer.textEdit.show({ node, e: event });
    };
    const handleDataChange = (...args: unknown[]) => {
      const data = args[0];
      // simple-mind-map emits data_change(undefined) when BACK/FORWARD has no
      // matching history entry. It is a no-op, not map data to persist.
      if (!data || typeof data !== 'object' || !('data' in data)) return;
      const nextData = data as OutlineNode;
      try {
        localStorage.setItem(`${STORAGE_PREFIX}${mapId}`, JSON.stringify(nextData));
        storageWarningShownRef.current = false;
      } catch {
        if (!storageWarningShownRef.current) {
          storageWarningShownRef.current = true;
          Message.warning('当前导图包含较大的图片，浏览器本地空间不足，部分修改可能无法自动保存');
        }
      }
      if (serverSaveTimerRef.current !== null) window.clearTimeout(serverSaveTimerRef.current);
      serverSaveTimerRef.current = window.setTimeout(() => {
        if (!serverReadyRef.current) return;
        void saveServerJson(`/api/maps/${encodeURIComponent(mapId)}`, nextData).catch(() => {
          if (!storageWarningShownRef.current) Message.warning('服务器暂时不可用，修改已保存在当前浏览器');
        });
      }, 500);
      const nextTitle = getPlainTitle(nextData.data.text);
      if (nextTitle) onTitleChangeRef.current?.(nextTitle);
    };

    instance.on('node_active', handleActive);
    instance.on('data_change', handleDataChange);
    instance.on('scale', handleScale);
    instance.on('view_data_change', handleViewDataChange);
    instance.on('rich_text_selection_change', handleRichTextSelection);
    instance.on('node_text_edit_change', handleNodeTextEditChange);
    instance.on(CUSTOM_NODE_TEXT_SELECTION_EVENT, handleCustomTextSelection);
    instance.on(CUSTOM_NODE_DESCRIPTION_EVENT, handleOpenNodeDescription);
    instance.on('node_contextmenu', handleNodeContextMenu);
    instance.on('node_mousedown', handlePlainNodeMouseDown);
    instance.on('node_click', handlePlainNodeClick);
    window.addEventListener('mousemove', trackPlainNodePointer);
    let disposed = false;
    const restoreInitialView = () => {
      const rect = el.getBoundingClientRect();
      if (disposed || !el.isConnected || rect.width === 0 || rect.height === 0) return;
      try {
        const view = instance.view as unknown as MindMapViewController;
        if (initialViewData) {
          view.setTransformData(initialViewData);
        } else {
          view.setScale(1);
        }
        const restoredViewData = view.getTransformData();
        setZoom(Math.round(restoredViewData.state.scale * 100));
        viewPersistenceReady = true;
      } catch {
        // The first StrictMode render may finish after its container is removed.
      }
    };
    mindMapRef.current = instance;
    void loadServerJson<OutlineNode>(`/api/maps/${encodeURIComponent(mapId)}`).then((serverData) => {
      if (disposed || !mindMapRef.current) return;
      serverReadyRef.current = true;
      if (serverData) {
        const normalizedServerData = normalizeMindMapMarkdownFormatting(serverData);
        const preferences = readMapPreferences(normalizedServerData);
        applyCurveRootLineOverride(normalizedServerData, preferences.lineStyle);
        try {
          localStorage.setItem(`${STORAGE_PREFIX}${mapId}`, JSON.stringify(normalizedServerData));
        } catch {
          // The server remains the source of truth when the browser cache is full.
        }
        renderedLayoutRef.current = preferences.layout;
        setLayout(preferences.layout);
        setTheme(preferences.theme);
        setBackgroundColor(preferences.backgroundColor);
        setShowNodeBorder(preferences.showNodeBorder);
        setNodeBorderShape(preferences.nodeBorderShape);
        setConnectionLineStyle(preferences.lineStyle);
        (instance as MindMapWithServerRenderer).renderer.setData(normalizedServerData);
        instance.setLayout(preferences.layout);
        instance.setThemeConfig(getThemeConfig(
          preferences.theme,
          preferences.backgroundColor,
          preferences.showNodeBorder,
          preferences.nodeBorderShape,
          preferences.lineStyle,
        ));
      } else {
        handleDataChange(instance.getData());
        void saveServerJson(`/api/maps/${encodeURIComponent(mapId)}`, instance.getData()).catch(() => undefined);
      }
      instance.render(() => {
        window.requestAnimationFrame(() => {
          restoreInitialView();
          setReadyMapId(mapId);
        });
      });
    });

    const observer = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      if (!disposed && el.isConnected && rect.width > 0 && rect.height > 0) {
        instance.resize();
      }
    });
    observer.observe(el);

    const isEditableTarget = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest(
      '[contenteditable="true"], input, textarea, button, a, .arco-image, .arco-trigger-popup'
    ));
    const preventSelectionWhilePanning = (event: MouseEvent) => {
      if (event.button !== 0 || isEditableTarget(event.target)) return;
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement
        && activeElement.isContentEditable
        && (el.contains(activeElement) || activeElement.matches('.mind-map-floating-editor'))
      ) {
        activeElement.blur();
      }
      event.preventDefault();
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) selection.removeAllRanges();
      el.classList.add('is-canvas-panning');
    };
    const finishPanning = () => el.classList.remove('is-canvas-panning');
    const finishEditOnWheel = () => {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement
        && activeElement.isContentEditable
        && (el.contains(activeElement) || activeElement.matches('.mind-map-floating-editor'))
      ) {
        activeElement.blur();
      }
    };
    const finishFloatingEditOnOutsideClick = (event: MouseEvent) => {
      const activeElement = document.activeElement;
      const target = event.target as Element | null;
      if (
        !(activeElement instanceof HTMLElement)
        || !activeElement.matches('.mind-map-floating-editor')
        || activeElement.contains(target)
        || target?.closest('.editor-floating-toolbar, .toolbar-color-menu, .arco-trigger-popup, .arco-color-picker')
      ) return;
      activeElement.blur();
    };
    const preventNativeImageDrag = (event: DragEvent) => {
      if (event.target instanceof HTMLImageElement) event.preventDefault();
    };
    const closeNodeContextMenu = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.mind-map-node-context-menu')) {
        setNodeContextMenu(null);
      }
    };
    const closeNodeContextMenuOnKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNodeContextMenu(null);
    };
    const closeNodeContextMenuOnBlur = () => setNodeContextMenu(null);
    document.addEventListener('mousedown', finishFloatingEditOnOutsideClick, true);
    document.addEventListener('mousedown', closeNodeContextMenu, true);
    document.addEventListener('keydown', closeNodeContextMenuOnKey);
    window.addEventListener('blur', closeNodeContextMenuOnBlur);
    el.addEventListener('mousedown', preventSelectionWhilePanning, true);
    el.addEventListener('wheel', finishEditOnWheel, true);
    el.addEventListener('dragstart', preventNativeImageDrag, true);
    window.addEventListener('mouseup', finishPanning);
    return () => {
      disposed = true;
      el.classList.remove('is-canvas-panning');
      document.removeEventListener('mousedown', finishFloatingEditOnOutsideClick, true);
      document.removeEventListener('mousedown', closeNodeContextMenu, true);
      document.removeEventListener('keydown', closeNodeContextMenuOnKey);
      window.removeEventListener('blur', closeNodeContextMenuOnBlur);
      el.removeEventListener('mousedown', preventSelectionWhilePanning, true);
      el.removeEventListener('wheel', finishEditOnWheel, true);
      el.removeEventListener('dragstart', preventNativeImageDrag, true);
      window.removeEventListener('mouseup', finishPanning);
      observer.disconnect();
      try {
        const finalViewData = (instance.view as unknown as MindMapViewController).getTransformData();
        if (isMindMapViewData(finalViewData)) {
          localStorage.setItem(`${VIEW_STORAGE_PREFIX}${mapId}`, JSON.stringify(finalViewData));
        }
      } catch {
        // Keep the last successfully persisted view if teardown happens mid-render.
      }
      instance.off('node_active', handleActive);
      instance.off('data_change', handleDataChange);
      instance.off('scale', handleScale);
      instance.off('view_data_change', handleViewDataChange);
      instance.off('rich_text_selection_change', handleRichTextSelection);
      instance.off('node_text_edit_change', handleNodeTextEditChange);
      instance.off(CUSTOM_NODE_TEXT_SELECTION_EVENT, handleCustomTextSelection);
      instance.off(CUSTOM_NODE_DESCRIPTION_EVENT, handleOpenNodeDescription);
      instance.off('node_contextmenu', handleNodeContextMenu);
      instance.off('node_mousedown', handlePlainNodeMouseDown);
      instance.off('node_click', handlePlainNodeClick);
      window.removeEventListener('mousemove', trackPlainNodePointer);
      instance.destroy();
      if (serverSaveTimerRef.current !== null) window.clearTimeout(serverSaveTimerRef.current);
      mindMapRef.current = null;
    };
  }, [mapId]);

  useEffect(() => {
    const instance = mindMapRef.current;
    const root = (instance as (MindMap & { renderer?: { root?: MindMapNode } }) | null)?.renderer?.root;
    if (!instance || !root || !title || getPlainTitle(root.getData('text')) === title) return;
    instance.execCommand('SET_NODE_DATA', root, { text: title, richText: false });
  }, [title]);

  useEffect(() => {
    if (!focusNodeText || !mapReady) return;
    const frame = window.requestAnimationFrame(() => {
      const instance = mindMapRef.current;
      const root = (instance as (MindMap & { renderer?: { root?: MindMapNode } }) | null)?.renderer?.root;
      const canvas = canvasRef.current;
      if (!instance || !root || !canvas) return;
      const queue = [root];
      let target: PositionedMindMapNode | null = null;
      while (queue.length > 0) {
        const node = queue.shift() as PositionedMindMapNode;
        if (getPlainTitle(node.getData('text')) === focusNodeText) {
          target = node;
          break;
        }
        queue.push(...(node.children ?? []));
      }
      if (!target) return;
      (target as unknown as ActivatableMindMapNode).active();
      const highlightTarget = target as unknown as SearchHighlightableMindMapNode;
      highlightTarget.highlight();
      const view = instance.view as unknown as MindMapViewController;
      const scale = view.getTransformData().state.scale || 1;
      view.translateXTo(canvas.clientWidth / 2 - (target.left + target.width / 2) * scale);
      view.translateYTo(canvas.clientHeight / 2 - (target.top + target.height / 2) * scale);
      window.setTimeout(() => highlightTarget.closeHighlight(), 2200);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusNodeText, mapReady]);

  useEffect(() => {
    const instance = mindMapRef.current;
    if (!instance || renderedLayoutRef.current === layout) return;
    renderedLayoutRef.current = layout;
    instance.setLayout(layout);
  }, [layout]);

  useEffect(() => {
    mindMapRef.current?.setThemeConfig(currentThemeConfig);
  }, [currentThemeConfig]);

  const requireNode = (action: (node: MindMapNode, instance: MindMap) => void) => {
    const instance = mindMapRef.current;
    if (!instance || !activeNode) {
      Message.info('请先选择一个节点');
      return;
    }
    action(activeNode, instance);
  };

  const setNodeStyle = (prop: string, value: string) => {
    const instance = mindMapRef.current;
    if (!instance || activeNodes.length === 0) {
      Message.info('请先选择一个节点');
      return;
    }
    activeNodes.forEach((node) => instance.execCommand('SET_NODE_STYLE', node, prop, value));
  };

  const saveMapPreference = (key: '_layout' | '_theme' | '_backgroundColor' | '_showNodeBorder' | '_nodeBorderShape' | '_lineStyle', value: string | boolean) => {
    const instance = mindMapRef.current;
    const root = (instance as (MindMap & { renderer?: { root?: MindMapNode } }) | null)?.renderer?.root;
    if (instance && root) instance.execCommand('SET_NODE_DATA', root, { [key]: value });
  };

  const changeLayout = (value: LayoutValue) => {
    setLayout(value);
    saveMapPreference('_layout', value);
    const selectedLineStyle = connectionLineStyles.find((item) => item.value === connectionLineStyle);
    if (selectedLineStyle && !isLineStyleSupported(selectedLineStyle, value)) {
      setConnectionLineStyle('rounded');
      const instance = mindMapRef.current;
      const root = (instance as (MindMap & { renderer?: { root?: MindMapNode } }) | null)?.renderer?.root;
      if (instance && root) {
        instance.execCommand('SET_NODE_DATA', root, { _lineStyle: 'rounded', lineStyle: 'straight' });
      }
    }
  };

  const changeConnectionLineStyle = (value: ConnectionLineStyleKey) => {
    setConnectionLineStyle(value);
    const instance = mindMapRef.current;
    const root = (instance as (MindMap & { renderer?: { root?: MindMapNode } }) | null)?.renderer?.root;
    if (!instance || !root) return;
    const selectedStyle = connectionLineStyles.find((item) => item.value === value) ?? connectionLineStyles[1];
    instance.execCommand('SET_NODE_DATA', root, value === 'curve' ? {
      _lineStyle: value,
      lineStyle: 'straight',
    } : { _lineStyle: value, lineStyle: selectedStyle.lineStyle });
  };

  const changeTheme = (value: ThemeKey) => {
    setTheme(value);
    setBackgroundColor('');
    saveMapPreference('_theme', value);
    saveMapPreference('_backgroundColor', '');
  };

  const changeBackgroundColor = (value: string) => {
    setBackgroundColor(value);
    saveMapPreference('_backgroundColor', value);
  };

  const changeShowNodeBorder = (checked: boolean) => {
    setShowNodeBorder(checked);
    saveMapPreference('_showNodeBorder', checked);
  };

  const changeNodeBorderShape = (value: NodeBorderShape) => {
    setNodeBorderShape(value);
    saveMapPreference('_nodeBorderShape', value);
  };

  const setCurrentStructureAsDefault = () => {
    saveDefaultMapPreferences({ layout, lineStyle: connectionLineStyle, showNodeBorder, nodeBorderShape });
    Message.success('已将当前导图样式设为默认');
  };

  const setCurrentThemeAsDefault = () => {
    saveDefaultMapPreferences({ theme, backgroundColor });
    Message.success('已将当前主题设为默认');
  };

  const restoreCustomTextSelection = () => {
    const customSelection = customTextSelectionRef.current;
    if (!customSelection?.element.isConnected) {
      customTextSelectionRef.current = null;
      return null;
    }
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(customSelection.range);
    return customSelection;
  };

  const saveCustomTextSelection = (customSelection: CustomNodeTextSelection) => {
    const selection = window.getSelection();
    if (selection?.rangeCount) customSelection.range = selection.getRangeAt(0).cloneRange();
    if (customSelection.commit) {
      customSelection.commit(customSelection.element.innerHTML);
      return;
    }
    customSelection.node.mindMap.execCommand('SET_NODE_DATA', customSelection.node, {
      text: customSelection.element.innerHTML,
      richText: true,
    });
  };

  const applyFontStyle = (style: 'bold' | 'italic' | 'underline' | 'strike') => {
    const customSelection = restoreCustomTextSelection();
    if (customSelection) {
      const command = style === 'strike' ? 'strikeThrough' : style;
      document.execCommand('styleWithCSS', false, 'true');
      document.execCommand(command, false);
      const active = document.queryCommandState(command);
      customSelection.formats = { ...customSelection.formats, [style]: active };
      setRichTextFormat(customSelection.formats);
      saveCustomTextSelection(customSelection);
      return;
    }
    const instance = mindMapRef.current as MindMapWithRichText | null;
    const canFormatSelection = Boolean(hasTextSelection && instance?.richText?.showTextEdit && (instance.richText.range || instance.richText.lastRange));
    if (canFormatSelection && instance?.richText) {
      instance.richText.formatText({ [style]: !richTextFormat[style] });
      setRichTextFormat((current) => ({ ...current, [style]: !current[style] }));
      return;
    }
    if (style === 'bold') {
      setNodeStyle('fontWeight', activeNode && getNodeStyleValue(activeNode, 'fontWeight', 'normal') === 'bold' ? 'normal' : 'bold');
    } else if (style === 'italic') {
      setNodeStyle('fontStyle', activeNode && getNodeStyleValue(activeNode, 'fontStyle', 'normal') === 'italic' ? 'normal' : 'italic');
    } else {
      const decoration = style === 'underline' ? 'underline' : 'line-through';
      setNodeStyle('textDecoration', activeNode && getNodeStyleValue(activeNode, 'textDecoration', 'none').includes(decoration) ? 'none' : decoration);
    }
  };

  const applyColor = (kind: 'color' | 'background', value: string) => {
    const customSelection = restoreCustomTextSelection();
    if (customSelection) {
      customSelection.range = applyInlineColor(
        customSelection.range,
        kind === 'color' ? 'color' : 'backgroundColor',
        value
      );
      customSelection.formats = { ...customSelection.formats, [kind]: value };
      setRichTextFormat(customSelection.formats);
      saveCustomTextSelection(customSelection);
      return;
    }
    const instance = mindMapRef.current as MindMapWithRichText | null;
    const canFormatSelection = Boolean(hasTextSelection && instance?.richText?.showTextEdit && (instance.richText.range || instance.richText.lastRange));
    if (canFormatSelection && instance?.richText) {
      instance.richText.formatText({ [kind]: value });
      setRichTextFormat((current) => ({ ...current, [kind]: value }));
      return;
    }
    setNodeStyle(kind === 'color' ? 'color' : 'fillColor', value);
  };

  const insertTable = () => {
    requireNode((node, instance) => {
      const tableData: TableData = {
        rows: tableSize.rows,
        columns: tableSize.columns,
        cells: Array.from({ length: tableSize.rows }, () =>
          Array.from({ length: tableSize.columns }, () => '')
        ),
      };
      instance.execCommand('SET_NODE_DATA', node, { _table: tableData });
      instance.render();
      setTableOpen(false);
      Message.success('表格已添加到当前节点');
    });
  };

  const handleImage = (file: File) => {
    requireNode((node, instance) => {
      if (!file.type.startsWith('image/')) {
        Message.error('请选择图片文件');
        return;
      }
      void uploadServerImage(file).then((url) => {
        const image = new window.Image();
        image.onload = () => {
          const nextImage: NodeImageData = {
            url, title: file.name, width: image.naturalWidth, height: image.naturalHeight,
          };
          instance.execCommand('SET_NODE_DATA', node, {
            _images: [...getNodeImages(node), nextImage],
            image: null,
            imageTitle: '',
            imageSize: null,
          });
          instance.render();
        };
        image.onerror = () => Message.error('图片读取失败，请更换图片后重试');
        image.src = url;
      }).catch((error: unknown) => {
        Message.error(error instanceof Error && error.message === 'IMAGE_TOO_LARGE' ? '图片不能超过 15MB' : '图片上传服务器失败，请重试');
      });
    });
    return false;
  };

  const handleImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const content = String(reader.result || '');
        if (/\.md$/i.test(file.name)) {
          mindMapRef.current?.setData(parseMindMapMarkdown(content));
        } else {
          const parsed: unknown = JSON.parse(content);
          if (typeof parsed === 'object' && parsed !== null && 'root' in parsed) {
            mindMapRef.current?.setFullData(parsed);
          } else {
            mindMapRef.current?.setData(parsed);
          }
        }
        Message.success('导入成功');
      } catch {
        Message.error('无法识别该文件，请导入 .md、.json 或 .smm 文件');
      }
    };
    reader.readAsText(file);
    return false;
  };

  const exportMenu = (
    <Menu onClickMenuItem={(type) => {
      const instance = mindMapRef.current;
      if (!instance) return;
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      window.requestAnimationFrame(() => {
        instance.render();
        window.requestAnimationFrame(() => {
          if (type === 'md') exportMarkdown(instance.getData() as OutlineNode, title);
          else void instance.export(type, true, title);
        });
      });
    }}>
      <Menu.Item key="json">导出 JSON</Menu.Item>
      <Menu.Item key="md">导出 Markdown</Menu.Item>
      <Menu.Item key="png">导出 PNG</Menu.Item>
      <Menu.Item key="svg">导出 SVG</Menu.Item>
    </Menu>
  );

  const toggleTodo = () => {
    const instance = mindMapRef.current;
    const nodes = activeNodes.filter((node) => !node.isRoot);
    if (!instance || nodes.length === 0) {
      Message.info('请先选择一个节点');
      return;
    }
    const shouldEnable = nodes.some((node) => !node.getData('_todo'));
    nodes.forEach((node) => {
      instance.execCommand('SET_NODE_DATA', node, shouldEnable ? {
        _todo: true,
        _todoChecked: false,
        _todoOriginalColor: node.getData('color') || '',
        _todoOriginalTextDecoration: node.getData('textDecoration') || 'none',
      } : {
        _todo: false,
        _todoChecked: false,
        color: node.getData('_todoOriginalColor') || '',
        textDecoration: node.getData('_todoOriginalTextDecoration') || 'none',
      });
    });
    instance.render();
  };

  const addAnnotation = () => {
    requireNode((node, instance) => {
      instance.execCommand('SET_NODE_DATA', node, { _annotationEnabled: true });
      instance.render();
    });
  };

  const openDescriptionForNode = (node: MindMapNode) => {
    if (!node.getData('isActive')) (node as ActivatableMindMapNode).active();
    setDescriptionNode(node);
    setDescription(String(node.getData('note') || ''));
    setDescriptionOpen(true);
  };

  const connectSelectedNodes = () => {
    const instance = mindMapRef.current;
    if (!instance || activeNodes.length === 0) {
      Message.info('请先选择一个起始节点');
      return;
    }
    if (activeNodes.length === 2) {
      instance.execCommand('ADD_ASSOCIATIVE_LINE', activeNodes[0], activeNodes[1]);
      Message.success('节点连接线已创建');
      return;
    }
    if (activeNodes.length === 1) {
      instance.associativeLine?.createLineFromActiveNode();
      Message.info('请再点击一个目标节点完成连接');
      return;
    }
    Message.info('请只选择两个需要连接的节点');
  };

  const duplicateActiveNode = () => {
    const instance = mindMapRef.current;
    if (!instance || !activeNode || activeNode.isRoot) return;
    const duplicate = (activeNode as MindMapNode & {
      getPureData: (removeActive?: boolean, removeId?: boolean) => OutlineNode;
    }).getPureData(true, true);
    instance.execCommand('INSERT_MULTI_NODE', [activeNode], [duplicate]);
  };

  const toggleActiveNode = () => {
    const instance = mindMapRef.current;
    if (!instance || !activeNode) return;
    instance.execCommand('SET_NODE_DATA', activeNode, { expand: activeNode.getData('expand') === false });
    instance.render();
  };

  const toggleActiveSiblings = () => {
    const instance = mindMapRef.current;
    if (!instance || !activeNode) return;
    const parent = (activeNode as MindMapNode & { parent?: { children?: MindMapNode[] } | null }).parent;
    const siblings = parent?.children ?? [activeNode];
    const expandable = siblings.filter((node) => {
      const data = node as MindMapNode & { nodeData: { children?: OutlineNode[] } };
      return (data.nodeData.children?.length ?? 0) > 0;
    });
    const shouldExpand = expandable.some((node) => node.getData('expand') === false);
    expandable.forEach((node) => instance.execCommand('SET_NODE_DATA', node, { expand: shouldExpand }));
    instance.render();
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const target = event.target as HTMLElement | null;
      const command = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (mode === 'outline') {
        if (target?.closest('input, textarea, .arco-modal, .arco-drawer, .arco-trigger-popup')) return;
        if (command && !event.shiftKey && !event.altKey && key === 'z') {
          event.preventDefault();
          undo();
        }
        if (command && !event.shiftKey && !event.altKey && key === 'y') {
          event.preventDefault();
          redo();
        }
        return;
      }
      if (mode !== 'mindmap' || target?.closest('input, textarea, .arco-modal, .arco-drawer, .arco-trigger-popup')) return;
      const instance = mindMapRef.current;
      const textColors: Record<string, string> = { d: '#1D2129', r: '#F53F3F', y: '#F7BA1E', g: '#00B42A', b: '#165DFF', p: '#722ED1' };
      const backgroundColors: Record<string, string> = { y: '#FFF7E8', r: '#FFECE8', h: '#F2F3F5', g: '#E8FFEA', b: '#E8F3FF', p: '#FFE8F1', c: '#E8FFFB' };
      const isEditingText = Boolean(target?.closest('[contenteditable="true"]'));
      const isTextFormattingShortcut = (command && !event.shiftKey && !event.altKey && ['b', 'i', 'u', 'enter'].includes(key))
        || (event.altKey && !event.shiftKey && !command && Boolean(textColors[key]))
        || (event.altKey && !event.shiftKey && command && Boolean(backgroundColors[key]));
      if (isEditingText && !isTextFormattingShortcut) return;
      const apply = (callback: () => void) => {
        event.preventDefault();
        callback();
      };

      if (command && key === '/') return apply(() => setShortcutHelpOpen(true));
      if (command && !event.shiftKey && !event.altKey && key === 'z') return apply(undo);
      if (command && !event.shiftKey && !event.altKey && key === 'y') return apply(redo);
      if (command && !event.shiftKey && !event.altKey && key === 'b') return apply(() => applyFontStyle('bold'));
      if (command && !event.shiftKey && !event.altKey && key === 'i') return apply(() => applyFontStyle('italic'));
      if (command && !event.shiftKey && !event.altKey && key === 'u') return apply(() => applyFontStyle('underline'));
      if (command && !event.shiftKey && !event.altKey && key === 'enter') return apply(() => applyFontStyle('strike'));
      if (command && event.shiftKey && !event.altKey && key === 'l') return apply(toggleTodo);
      if (command && event.shiftKey && !event.altKey && key === 'k') return apply(() => {
        const nodes = activeNodes.filter((node) => !node.isRoot && node.getData('_todo'));
        if (nodes.length === 0) return;
        const shouldComplete = nodes.some((node) => !node.getData('_todoChecked'));
        nodes.forEach((node) => instance?.execCommand('SET_NODE_DATA', node, { _todoChecked: shouldComplete }));
        instance?.render();
      });
      if (command && event.altKey && !event.shiftKey && key === 't') return apply(() => setTableOpen(true));
      if (event.shiftKey && !command && !event.altKey && key === 'enter') return apply(() => {
        if (activeNode) openDescriptionForNode(activeNode);
      });
      if (command && event.shiftKey && !event.altKey && key === 'backspace') return apply(() => instance?.execCommand('REMOVE_NODE'));
      if (command && !event.shiftKey && !event.altKey && key === 'd') return apply(duplicateActiveNode);
      if ((event.ctrlKey || event.altKey) && !event.shiftKey && key === '.') return apply(toggleActiveNode);
      if (command && event.shiftKey && !event.altKey && key === '.') return apply(toggleActiveSiblings);
      if (command && !event.shiftKey && !event.altKey && key === ']') return apply(() => {
        const child = (activeNode as MindMapNode & { children?: MindMapNode[] } | null)?.children?.[0];
        if (child) (child as ActivatableMindMapNode).active();
      });
      if (command && !event.shiftKey && !event.altKey && key === '[') return apply(() => {
        const parent = (activeNode as MindMapNode & { parent?: MindMapNode | null } | null)?.parent;
        if (parent) (parent as ActivatableMindMapNode).active();
      });

      if (event.altKey && !event.shiftKey && !command && textColors[key]) return apply(() => applyColor('color', textColors[key]));
      if (event.altKey && !event.shiftKey && command && backgroundColors[key]) return apply(() => applyColor('background', backgroundColors[key]));
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [
    activeNode,
    activeNodes,
    applyColor,
    applyFontStyle,
    duplicateActiveNode,
    hasTextSelection,
    mode,
    redo,
    richTextFormat,
    toggleActiveNode,
    toggleActiveSiblings,
    toggleTodo,
    undo,
  ]);

  const runNodeContextAction = (action: string) => {
    const context = nodeContextMenu;
    const instance = mindMapRef.current;
    if (!context || !instance) return;
    const node = context.node;
    setNodeContextMenu(null);
    switch (action) {
      case 'insert-sibling':
        instance.execCommand('INSERT_NODE', true, [node]);
        break;
      case 'insert-child':
        instance.execCommand('INSERT_CHILD_NODE', true, [node]);
        break;
      case 'insert-parent':
        instance.execCommand('INSERT_PARENT_NODE', true, [node]);
        break;
      case 'copy':
        (instance.renderer as ClipboardRenderer).copy();
        Message.success('节点已复制');
        break;
      case 'cut':
        (instance.renderer as ClipboardRenderer).cut();
        break;
      case 'paste':
        void (instance.renderer as ClipboardRenderer).paste();
        break;
      case 'duplicate': {
        const duplicate = (node as MindMapNode & { getPureData: (removeActive?: boolean, removeId?: boolean) => OutlineNode }).getPureData(true, true);
        instance.execCommand('INSERT_MULTI_NODE', [node], [duplicate]);
        break;
      }
      case 'add-description':
        openDescriptionForNode(node);
        break;
      case 'remove-description':
        instance.execCommand('SET_NODE_NOTE', node, '');
        instance.render();
        Message.success('节点描述已删除');
        break;
      case 'remove-current':
        instance.execCommand('REMOVE_CURRENT_NODE', [node]);
        break;
      case 'remove-tree':
        instance.execCommand('REMOVE_NODE', [node]);
        break;
      case 'toggle-siblings': {
        const contextNode = node as MindMapNode & {
          parent?: { children?: MindMapNode[] } | null;
          nodeData: { children?: OutlineNode[] };
        };
        const siblings = contextNode.parent?.children ?? [node];
        const expandableSiblings = siblings.filter((item) => {
          const current = item as MindMapNode & { nodeData: { children?: OutlineNode[] } };
          return (current.nodeData.children?.length ?? 0) > 0;
        });
        const shouldExpand = expandableSiblings.some((item) => item.getData('expand') === false);
        expandableSiblings.forEach((item) => instance.execCommand('SET_NODE_DATA', item, { expand: shouldExpand }));
        instance.render();
        break;
      }
      case 'enter':
        instance.execCommand('GO_TARGET_NODE', node);
        break;
    }
  };

  const nodeContextMenuContent = nodeContextMenu ? (
    <Menu className="mind-map-node-context-menu-list" onClickMenuItem={runNodeContextAction}>
      <Menu.Item key="insert-sibling" disabled={Boolean(nodeContextMenu.node.isRoot)}><span>插入同级主题</span><kbd>Enter</kbd></Menu.Item>
      <Menu.Item key="insert-child"><span>插入下级主题</span><kbd>Tab</kbd></Menu.Item>
      <Menu.Item key="insert-parent" disabled={Boolean(nodeContextMenu.node.isRoot)}><span>插入上级主题</span><kbd>Shift + Tab</kbd></Menu.Item>
      <li className="mind-map-node-context-menu-divider" aria-hidden="true" />
      <Menu.Item key="copy"><span>复制</span><kbd>Ctrl + C</kbd></Menu.Item>
      <Menu.Item key="cut" disabled={Boolean(nodeContextMenu.node.isRoot)}><span>剪切</span><kbd>Ctrl + X</kbd></Menu.Item>
      <Menu.Item key="paste"><span>粘贴</span><kbd>Ctrl + V</kbd></Menu.Item>
      <Menu.Item key="duplicate" disabled={Boolean(nodeContextMenu.node.isRoot)}><span>创建副本</span><kbd>Ctrl + D</kbd></Menu.Item>
      <li className="mind-map-node-context-menu-divider" aria-hidden="true" />
      <Menu.Item key="add-description"><span>添加描述</span></Menu.Item>
      {Boolean(nodeContextMenu.node.getData('note')) && <Menu.Item key="remove-description"><span>删除描述</span></Menu.Item>}
      <Menu.Item key="remove-current" disabled={Boolean(nodeContextMenu.node.isRoot)}><span>仅删除当前主题</span></Menu.Item>
      <Menu.Item key="remove-tree" disabled={Boolean(nodeContextMenu.node.isRoot)}><span>删除当前主题及下级主题</span><kbd>Delete</kbd></Menu.Item>
      <li className="mind-map-node-context-menu-divider" aria-hidden="true" />
      <Menu.Item key="toggle-siblings"><span>展开/折叠同级主题</span><kbd>Ctrl + Shift + -</kbd></Menu.Item>
      <Menu.Item key="enter"><span>进入此主题</span><kbd>Ctrl + ]</kbd></Menu.Item>
    </Menu>
  ) : null;

  const selectedLayout = layouts.find((item) => item.value === layout) ?? layouts[0];
  const structurePanel = (
    <div className="mind-map-structure-panel">
      <div className="mind-map-structure-panel-header">
        <div>
          <strong>结构</strong>
          <span>选择导图的组织方式</span>
        </div>
        <Button size="mini" onClick={setCurrentStructureAsDefault}>默认样式</Button>
      </div>
      <div className="mind-map-structure-panel-body">
        <div className="mind-map-structure-grid">
          {layouts.map((item) => (
            <Button
              type="text"
              key={item.value}
              aria-label={`${item.label}：${item.description}`}
              aria-pressed={layout === item.value}
              className={`mind-map-structure-card${layout === item.value ? ' is-selected' : ''}`}
              onClick={() => changeLayout(item.value)}
            >
              <span className="mind-map-structure-card-icon">{getLayoutIcon(item.value)}</span>
              <span className="mind-map-structure-card-copy">
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>
              {layout === item.value && <IconCheck className="mind-map-structure-card-check" />}
            </Button>
          ))}
        </div>
        <Divider />
        <section className="mind-map-structure-group is-line-style">
          <div className="mind-map-structure-group-label">连接线</div>
          <Radio.Group
            className="mind-map-line-style-radio"
            type="button"
            name="mind-map-line-style"
            value={connectionLineStyle}
            options={connectionLineStyles.map((item) => ({
              label: item.label,
              value: item.value,
              disabled: !isLineStyleSupported(item, layout),
            }))}
            onChange={(value) => changeConnectionLineStyle(value as ConnectionLineStyleKey)}
          />
        </section>
        <Divider />
        <div className="mind-map-structure-option-row">
          <span>显示节点外框</span>
          <Switch
            size="small"
            checked={showNodeBorder}
            aria-label="显示节点外框"
            onChange={changeShowNodeBorder}
          />
        </div>
        <div className="mind-map-structure-option-row">
          <span>外框形状</span>
          <Radio.Group
            type="button"
            size="small"
            value={nodeBorderShape}
            disabled={!showNodeBorder}
            options={[
              { label: '圆角', value: 'rounded' },
              { label: '直角', value: 'square' },
            ]}
            onChange={(value) => changeNodeBorderShape(value as NodeBorderShape)}
          />
        </div>
      </div>
    </div>
  );

  const themePanel = (
    <div className="mind-map-theme-panel">
      <div className="mind-map-theme-panel-header">
        <strong>配色</strong>
        <Button size="mini" onClick={setCurrentThemeAsDefault}>默认主题</Button>
      </div>
      {(['简约', '浅色', '深色'] as const).map((group) => (
        <section className="mind-map-theme-group" key={group}>
          <div className="mind-map-theme-group-label">{group}</div>
          <div className="mind-map-theme-grid">
            {Object.entries(themes).filter(([, item]) => item.group === group).map(([key, item]) => (
              <button
                type="button"
                key={key}
                className={`mind-map-theme-card${theme === key && !backgroundColor ? ' is-selected' : ''}`}
                style={{ background: item.config.backgroundColor, color: item.config.root.color }}
                onClick={() => changeTheme(key as ThemeKey)}
              >
                <strong>{item.label}</strong>
                <span className={`mind-map-theme-swatches is-${item.preview}`}>
                  {item.swatches.map((color) => <i key={color} style={{ background: color }} />)}
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
      <div className="mind-map-theme-footer">
        <div className="mind-map-theme-background-row">
          <span>背景色</span>
          <ColorPicker
            value={backgroundColor || themes[theme].config.backgroundColor}
            showText={false}
            triggerProps={{ popupStyle: { zIndex: 12001 } }}
            onChange={(color) => typeof color === 'string' && changeBackgroundColor(color)}
            triggerElement={(
              <button
                type="button"
                className="mind-map-background-color-trigger"
                aria-label="自定义画布背景色"
                title="自定义画布背景色"
                style={{ background: backgroundColor || themes[theme].config.backgroundColor }}
              />
            )}
          />
        </div>
      </div>
    </div>
  );

  const switchMode = async (nextMode: ViewMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    localStorage.setItem(`${DISPLAY_MODE_STORAGE_PREFIX}${mapId}`, nextMode);
    window.setTimeout(() => mindMapRef.current?.resize(), 0);
  };

  const topToolbar = (
    <Space className="mind-editor-top-actions" size={4} wrap={false}>
      <Button.Group>
        <Button type={mode === 'mindmap' ? 'primary' : 'secondary'} icon={<IconBranch />} onClick={() => switchMode('mindmap')}>导图</Button>
        <Button type={mode === 'outline' ? 'primary' : 'secondary'} icon={<IconMenu />} onClick={() => switchMode('outline')}>大纲</Button>
      </Button.Group>
      <Divider type="vertical" />
      <Tooltip content="撤销"><Button aria-label="撤销" icon={<IconUndo />} onClick={undo} /></Tooltip>
      <Tooltip content="重做"><Button aria-label="重做" icon={<IconRedo />} onClick={redo} /></Tooltip>
      <Tooltip content="添加同级节点"><Button aria-label="添加同级节点" disabled={!hasActiveNode} icon={<IconPlus />} onClick={() => mindMapRef.current?.execCommand('INSERT_NODE')} /></Tooltip>
      <Tooltip content="添加子节点"><Button aria-label="添加子节点" disabled={!hasActiveNode} icon={<IconBranch />} onClick={() => mindMapRef.current?.execCommand('INSERT_CHILD_NODE')} /></Tooltip>
      <Tooltip content="删除节点"><Button aria-label="删除节点" disabled={!hasActiveNode} icon={<IconMinus />} status="danger" onClick={() => mindMapRef.current?.execCommand('REMOVE_CURRENT_NODE')} /></Tooltip>
      <Divider type="vertical" />
      <Popover
        trigger="click"
        position="br"
        content={structurePanel}
        triggerProps={{ popupStyle: { padding: 0, zIndex: 12000 } }}
      >
        <Button
          className="mind-map-structure-trigger"
          aria-label={`结构：${selectedLayout.label}`}
          title="结构与连接线"
          icon={getLayoutIcon(layout)}
        >
          {selectedLayout.label}
        </Button>
      </Popover>
      <Popover trigger="click" position="br" content={themePanel} triggerProps={{ popupStyle: { padding: 0, zIndex: 12000 } }}>
        <Button aria-label="主题" title="主题" icon={<IconPalette />} />
      </Popover>
      <Divider type="vertical" />
      <Upload accept=".md,.json,.smm" showUploadList={false} beforeUpload={handleImport}>
        <Button aria-label="导入" title="导入" icon={<IconImport />} />
      </Upload>
      <Dropdown droplist={exportMenu} trigger="click">
        <Button aria-label="导出" title="导出" icon={<IconDownload />} />
      </Dropdown>
    </Space>
  );

  return (
    <div className="mind-editor">
      {toolbarTarget && createPortal(topToolbar, toolbarTarget)}
      {nodeContextMenu && createPortal(
        <div
          className="mind-map-node-context-menu"
          style={{ top: nodeContextMenu.top, left: nodeContextMenu.left }}
          onContextMenu={(event) => event.preventDefault()}
        >
          {nodeContextMenuContent}
        </div>,
        document.body
      )}
      <div className={`mind-editor-stage${mode === 'mindmap' && hasSelection && !nodeContextMenu ? ' has-bottom-toolbar' : ''}`}>
        <div
          ref={canvasRef}
          className={`mind-map-canvas${mode === 'outline' ? ' is-hidden' : ''}${!mapReady ? ' is-initializing' : ''}`}
        />
        {!mapReady && (
          <div className="mind-map-initializing">
            <Spin size={28} tip="正在加载导图…" />
          </div>
        )}
        {mode === 'mindmap' && hasSelection && !nodeContextMenu && (
          <SharedEditorToolbar
            placement="below"
            style={{ bottom: 18, left: '50%' }}
            activeFormats={{
              bold: Boolean(hasTextSelection ? richTextFormat.bold : activeNode && getNodeStyleValue(activeNode, 'fontWeight', 'normal') === 'bold'),
              italic: Boolean(hasTextSelection ? richTextFormat.italic : activeNode && getNodeStyleValue(activeNode, 'fontStyle', 'normal') === 'italic'),
              underline: Boolean(hasTextSelection ? richTextFormat.underline : activeNode && getNodeStyleValue(activeNode, 'textDecoration', 'none').includes('underline')),
              strike: Boolean(hasTextSelection ? richTextFormat.strike : activeNode && getNodeStyleValue(activeNode, 'textDecoration', 'none').includes('line-through')),
            }}
            activeTools={{
              image: Boolean(activeNode && getNodeImages(activeNode).length > 0),
              todo: Boolean(activeNode?.getData('_todo')),
              annotation: Boolean(activeNode?.getData('_annotationEnabled')),
              description: Boolean(activeNode?.getData('note')),
              table: Boolean(activeNode?.getData('_table')),
            }}
            textColor={String((hasTextSelection
              ? richTextFormat.color
              : activeNode
                ? getNodeStyleValue(activeNode, 'color', currentThemeConfig.root.color)
                : currentThemeConfig.root.color) || currentThemeConfig.root.color)}
            textColorActive={Boolean(hasTextSelection ? richTextFormat.color : activeNode?.getData('color'))}
            backgroundColor={String((hasTextSelection
              ? richTextFormat.background
              : activeNode?.getData('fillColor')) || currentThemeConfig.backgroundColor)}
            backgroundColorActive={Boolean(hasTextSelection
              ? richTextFormat.background
              : activeNode?.getData('fillColor') && activeNode.getData('fillColor') !== 'transparent')}
            onFormat={applyFontStyle}
            onTextColor={(value) => applyColor('color', value)}
            onBackgroundColor={(value) => applyColor('background', value)}
            onImage={handleImage}
            onTodo={toggleTodo}
            onAnnotation={addAnnotation}
            onDescription={() => { if (activeNode) openDescriptionForNode(activeNode); }}
            onTable={() => setTableOpen(true)}
            extraActions={(
              <>
                <Button
                  type="text"
                  size="large"
                  aria-label="概要"
                  aria-pressed={Boolean(activeNode?.getData('generalization'))}
                  className={activeNode?.getData('generalization') ? 'is-active' : undefined}
                  title="概要"
                  disabled={!hasSelection}
                  icon={<IconQuote />}
                  onClick={() => mindMapRef.current?.execCommand('ADD_GENERALIZATION')}
                />
                <Button
                  type="text"
                  size="large"
                  aria-label="连接节点"
                  aria-pressed={Boolean((activeNode?.getData('associativeLineTargets') as unknown[] | undefined)?.length)}
                  className={(activeNode?.getData('associativeLineTargets') as unknown[] | undefined)?.length ? 'is-active' : undefined}
                  title="连接节点"
                  disabled={!hasSelection}
                  icon={<IconLink />}
                  onClick={connectSelectedNodes}
                />
              </>
            )}
            onDelete={() => mindMapRef.current?.execCommand('REMOVE_CURRENT_NODE')}
            deleteDisabled={activeNodes.some((node) => Boolean(node.isRoot))}
            onMouseDown={(event) => {
              if (customTextSelectionRef.current) event.preventDefault();
            }}
          />
        )}
        {mode === 'mindmap' && (
          <Space className="mind-editor-zoom" size={0}>
            <Tooltip content="缩小"><Button aria-label="缩小" icon={<IconZoomOut />} onClick={() => mindMapRef.current?.view.narrow()} /></Tooltip>
            <Button className="zoom-value" aria-label="恢复 100%" onClick={() => {
              const instance = mindMapRef.current;
              if (instance) (instance.view as unknown as MindMapViewController).setScale(1);
            }}>{zoom}%</Button>
            <Tooltip content="放大"><Button aria-label="放大" icon={<IconZoomIn />} onClick={() => mindMapRef.current?.view.enlarge()} /></Tooltip>
          </Space>
        )}
        {mode === 'outline' && (
          <div className="mind-outline-panel">
            <OutlineEditor
              key={mapId}
              store={documentStore}
            />
          </div>
        )}
      </div>

      <Modal className="shortcut-help-modal" title="快捷键" visible={shortcutHelpOpen} footer={null} onCancel={() => setShortcutHelpOpen(false)}>
        <div className="shortcut-help-list">
          {shortcutSections.map((section) => (
            <section key={section.title} className="shortcut-help-section">
              <h3>{section.title}</h3>
              {section.items.map(([label, keys]) => (
                <div key={label} className="shortcut-help-row">
                  <span className="shortcut-help-label">{label}</span>
                  <span className="shortcut-help-keys">
                    {keys.map((key, index) => <span key={key}>{index > 0 && <i>+</i>}<kbd>{key}</kbd></span>)}
                  </span>
                </div>
              ))}
            </section>
          ))}
        </div>
      </Modal>

      <Drawer title="节点描述" width={420} visible={descriptionOpen} onCancel={() => setDescriptionOpen(false)} footer={
        <Space><Button onClick={() => setDescriptionOpen(false)}>取消</Button><Button type="primary" onClick={() => {
          const instance = mindMapRef.current;
          if (!instance || !descriptionNode) return;
          instance.execCommand('SET_NODE_NOTE', descriptionNode, description);
          instance.render();
          setDescriptionOpen(false);
          Message.success('节点描述已保存');
        }}>保存</Button></Space>
      }>
        <Input.TextArea value={description} onChange={setDescription} autoSize={{ minRows: 10 }} placeholder="补充节点背景、结论或参考信息…" />
      </Drawer>

      <Modal className="table-insert-modal" style={{ width: 380 }} title="插入表格" visible={tableOpen} onCancel={() => setTableOpen(false)} onOk={insertTable} okText="插入">
        <Space className="table-size-fields" size={12}>
          <Input type="number" min={1} max={10} addBefore="行" value={String(tableSize.rows)} onChange={(value) => setTableSize((state) => ({ ...state, rows: Math.max(1, Math.min(10, Number(value) || 1)) }))} />
          <Input type="number" min={1} max={10} addBefore="列" value={String(tableSize.columns)} onChange={(value) => setTableSize((state) => ({ ...state, columns: Math.max(1, Math.min(10, Number(value) || 1)) }))} />
        </Space>
      </Modal>
    </div>
  );
}
