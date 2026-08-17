import type { OutlineNode } from './OutlineEditor';

type TableData = { rows: number; columns: number; cells: string[][] };
type ImageData = { url: string; title?: string };
const RICH_TEXT_DATA_VERSION = '0.14.0';

const makeNode = (text: string): OutlineNode => ({
  data: { text: markdownInlineToHtml(text), richText: /[*_<]/.test(text), expand: true },
  children: [],
});

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

function markdownInlineToHtml(value: string) {
  const underlines: string[] = [];
  const protectedValue = value.replace(/<u>([\s\S]*?)<\/u>/gi, (_, content: string) => {
    const index = underlines.push(escapeHtml(content)) - 1;
    return `@@MINDMAP_UNDERLINE_${index}@@`;
  });
  return escapeHtml(protectedValue)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/@@MINDMAP_UNDERLINE_(\d+)@@/g, (_, index: string) => `<u>${underlines[Number(index)]}</u>`);
}

export function normalizeMarkdownBoldHtml(value: string) {
  if (!/(\*\*.+?\*\*|__.+?__)/.test(value)) return value;
  const container = document.createElement('div');
  container.innerHTML = value;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
  textNodes.forEach((textNode) => {
    const source = textNode.data;
    const html = escapeHtml(source)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>');
    if (html === escapeHtml(source)) return;
    const template = document.createElement('template');
    template.innerHTML = html;
    textNode.replaceWith(template.content);
  });
  return container.innerHTML;
}

export function normalizeMindMapMarkdownFormatting(root: OutlineNode) {
  const visit = (node: OutlineNode) => {
    const text = String(node.data.text ?? '');
    const formattedText = normalizeMarkdownBoldHtml(text);
    if (formattedText !== text) {
      node.data.text = formattedText;
      node.data.richText = true;
    }
    const annotation = String(node.data._annotation ?? '');
    const formattedAnnotation = normalizeMarkdownBoldHtml(annotation);
    if (formattedAnnotation !== annotation) node.data._annotation = formattedAnnotation;
    const table = node.data._table as TableData | undefined;
    if (table?.cells) {
      table.cells = table.cells.map((row) => row.map((cell) => normalizeMarkdownBoldHtml(String(cell ?? ''))));
    }
    node.children?.forEach(visit);
  };
  visit(root);
  root.smmVersion = RICH_TEXT_DATA_VERSION;
  return root;
}

function htmlToMarkdownInline(value: unknown) {
  const container = document.createElement('div');
  container.innerHTML = String(value ?? '');
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (!(node instanceof HTMLElement)) return '';
    const content = Array.from(node.childNodes).map(walk).join('');
    const tag = node.tagName.toLowerCase();
    if (tag === 'strong' || tag === 'b') return `**${content}**`;
    if (tag === 'em' || tag === 'i') return `*${content}*`;
    if (tag === 'u') return `<u>${content}</u>`;
    if (tag === 'br') return '\n';
    if (['p', 'div'].includes(tag)) return `${content}\n`;
    return content;
  };
  return Array.from(container.childNodes).map(walk).join('').trim();
}

function splitTableRow(line: string) {
  const source = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let value = '';
  let escaped = false;
  for (const character of source) {
    if (escaped) {
      value += character;
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    } else if (character === '|') {
      cells.push(value.trim());
      value = '';
    } else {
      value += character;
    }
  }
  cells.push(value.trim());
  return cells;
}

const isTableSeparator = (cells: string[]) => cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));

function appendAnnotation(node: OutlineNode, lines: string[]) {
  const html = lines.map((line) => markdownInlineToHtml(line)).join('<br>');
  const existing = String(node.data._annotation ?? '');
  node.data._annotationEnabled = true;
  node.data._annotation = existing ? `${existing}<br>${html}` : html;
}

function appendImage(node: OutlineNode, alt: string, url: string) {
  const images = Array.isArray(node.data._images) ? node.data._images as ImageData[] : [];
  node.data._images = [...images, { url, title: alt }];
}

export function parseMindMapMarkdown(markdown: string): OutlineNode {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  let root: OutlineNode = makeNode('未命名');
  let rootAssigned = false;
  let currentSection: OutlineNode | null = null;
  let lastNode = root;
  const stack: Array<{ level: number; node: OutlineNode }> = [];

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading && heading[1].length === 1 && !rootAssigned) {
      root = makeNode(heading[2]);
      rootAssigned = true;
      lastNode = root;
      continue;
    }

    const image = trimmed.match(/^!\[([^\]]*)\]\((.+)\)$/);
    if (image) {
      appendImage(lastNode, image[1], image[2]);
      continue;
    }

    if (/^\|.*\|$/.test(trimmed)) {
      const tableLines: string[] = [];
      while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index])) {
        tableLines.push(lines[index].trim());
        index += 1;
      }
      index -= 1;
      const parsedRows = tableLines.map(splitTableRow);
      const rows = parsedRows.filter((cells) => !isTableSeparator(cells));
      const columns = Math.max(0, ...rows.map((row) => row.length));
      const cells = rows.map((row) => Array.from({ length: columns }, (_, column) => markdownInlineToHtml(row[column] ?? '')));
      if (cells.length > 0 && columns > 0) {
        lastNode.data._table = { rows: cells.length, columns, cells } satisfies TableData;
      }
      continue;
    }

    if (/^\s*>/.test(raw)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ''));
        index += 1;
      }
      index -= 1;
      appendAnnotation(lastNode, quoteLines);
      continue;
    }

    const bullet = raw.match(/^(\s*)[-*+]\s+(.+)$/);
    if (bullet) {
      const level = Math.floor(bullet[1].replaceAll('\t', '  ').length / 2) + 1;
      const node = makeNode(bullet[2].replace(/^#{1,6}\s+/, ''));
      while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
      const parent = stack[stack.length - 1]?.node ?? currentSection ?? root;
      parent.children ??= [];
      parent.children.push(node);
      stack.push({ level, node });
      lastNode = node;
      continue;
    }

    if (heading) {
      const level = Math.max(0, heading[1].length - 2);
      const node = makeNode(heading[2]);
      while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
      const parent = stack[stack.length - 1]?.node ?? root;
      parent.children ??= [];
      parent.children.push(node);
      stack.push({ level, node });
      currentSection = level === 0 ? node : currentSection;
      lastNode = node;
      continue;
    }

    const section = makeNode(trimmed);
    root.children ??= [];
    root.children.push(section);
    currentSection = section;
    lastNode = section;
    stack.length = 0;
    stack.push({ level: 0, node: section });
  }

  root.smmVersion = RICH_TEXT_DATA_VERSION;
  return root;
}

const escapeCell = (value: string) => value.replaceAll('|', '\\|').replaceAll('\n', '<br>');

function appendNodeAttachments(lines: string[], node: OutlineNode, indent: string) {
  const annotation = htmlToMarkdownInline(node.data._annotation);
  if (node.data._annotationEnabled && annotation) {
    annotation.split('\n').forEach((line) => lines.push(`${indent}> ${line}`));
  }

  const table = node.data._table as TableData | undefined;
  if (table?.cells?.length) {
    const columns = Math.max(table.columns || 0, ...table.cells.map((row) => row.length));
    const rows = table.cells.map((row) => Array.from({ length: columns }, (_, column) => escapeCell(htmlToMarkdownInline(row[column] ?? ''))));
    lines.push(`${indent}| ${rows[0].join(' | ')} |`);
    lines.push(`${indent}| ${Array.from({ length: columns }, () => '---').join(' | ')} |`);
    rows.slice(1).forEach((row) => lines.push(`${indent}| ${row.join(' | ')} |`));
  }

  const storedImages = Array.isArray(node.data._images) ? node.data._images as ImageData[] : [];
  const images = [...storedImages];
  if (typeof node.data.image === 'string' && node.data.image && !images.some((image) => image.url === node.data.image)) {
    images.unshift({ url: node.data.image, title: String(node.data.imageTitle ?? '') });
  }
  images.forEach((image, index) => {
    const label = (image.title?.trim() || `图片 ${index + 1}`).replaceAll('[', '').replaceAll(']', '');
    lines.push(`${indent}![${label}](${image.url})`);
  });
}

export function serializeMindMapMarkdown(root: OutlineNode) {
  const lines = [`# ${htmlToMarkdownInline(root.data.text) || '未命名'}`, ''];
  appendNodeAttachments(lines, root, '');

  const walkList = (node: OutlineNode, depth: number) => {
    const indent = '  '.repeat(depth);
    lines.push(`${indent}- ${htmlToMarkdownInline(node.data.text)}`);
    appendNodeAttachments(lines, node, `${indent}  `);
    node.children?.forEach((child) => walkList(child, depth + 1));
  };

  root.children?.forEach((section, index) => {
    if (index > 0 || lines[lines.length - 1] !== '') lines.push('');
    lines.push(htmlToMarkdownInline(section.data.text));
    appendNodeAttachments(lines, section, '');
    section.children?.forEach((child) => walkList(child, 0));
  });

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}
