import {
  createDocument,
  createId,
  type CreateNodeInput,
  type NodeId,
  type ZhiJianContentBlockType,
  type ZhiJianDocument,
  type ZhiJianImage,
  type ZhiJianNode,
} from '../core';
import {
  isMarkdownTableSeparator,
  sanitizeInlineMarkdown,
  sanitizeMarkdownUrl,
  splitMarkdownTableRow,
  stripDangerousInlineHtml,
} from './inlineMarkdown';
import type { ParseMarkdownOptions } from './markdownTypes';

interface StackItem {
  level: number;
  nodeId: NodeId;
}

const todoPattern = /^\[([ xX])]\s+(.*)$/;
const imagePattern = /^!\[([^\]]*)]\(([^)]+)\)$/;

function parseContentBlock(raw: string): Pick<CreateNodeInput, 'content' | 'blockType' | 'todo'> {
  let source = raw.trim();
  let todo: CreateNodeInput['todo'];
  const todoMatch = source.match(todoPattern);
  if (todoMatch) {
    todo = { enabled: true, checked: todoMatch[1].toLowerCase() === 'x' };
    source = todoMatch[2].trim();
  }
  const heading = source.match(/^(#{1,3})\s+(.+)$/);
  const blockType: ZhiJianContentBlockType = heading
    ? (`heading${heading[1].length}` as ZhiJianContentBlockType)
    : 'text';
  const content = sanitizeInlineMarkdown(heading ? heading[2].trim() : source);
  return { content, blockType, todo };
}

function createParsedNode(input: CreateNodeInput & { id: NodeId; parentId: NodeId }): ZhiJianNode {
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

function appendNode(document: ZhiJianDocument, parentId: NodeId, input: CreateNodeInput): NodeId {
  const id = input.id ?? createId();
  const parent = document.nodes[parentId];
  if (!parent) throw new Error(`Parent "${parentId}" does not exist.`);
  document.nodes[id] = createParsedNode({ ...input, id, parentId });
  document.nodes[parentId] = {
    ...parent,
    children: [...parent.children, id],
  };
  return id;
}

function appendNote(document: ZhiJianDocument, nodeId: NodeId, noteLines: string[]): void {
  const node = document.nodes[nodeId];
  const nextNote = noteLines.map((line) => stripDangerousInlineHtml(line)).join('\n').trim();
  if (!node || !nextNote) return;
  document.nodes[nodeId] = {
    ...node,
    note: node.note ? `${node.note}\n${nextNote}` : nextNote,
  };
}

function appendImage(document: ZhiJianDocument, nodeId: NodeId, alt: string, url: string): void {
  const node = document.nodes[nodeId];
  if (!node) return;
  const image: ZhiJianImage = {
    id: createId(),
    url: sanitizeMarkdownUrl(url),
    alt: stripDangerousInlineHtml(alt),
  };
  document.nodes[nodeId] = {
    ...node,
    images: [...(node.images ?? []), image],
  };
}

function appendTable(document: ZhiJianDocument, nodeId: NodeId, tableLines: string[]): void {
  const node = document.nodes[nodeId];
  if (!node) return;
  const rows = tableLines
    .map(splitMarkdownTableRow)
    .filter((cells) => !isMarkdownTableSeparator(cells));
  if (rows.length === 0) return;
  document.nodes[nodeId] = {
    ...node,
    table: { rows },
  };
}

export function parseMarkdown(markdown: string, options: ParseMarkdownOptions = {}): ZhiJianDocument {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const firstHeadingIndex = lines.findIndex((line) => /^#\s+/.test(line.trim()));
  const rootTitle = firstHeadingIndex >= 0 ? stripDangerousInlineHtml(lines[firstHeadingIndex].trim().replace(/^#\s+/, '')) : '未命名';
  const document = createDocument({
    id: options.documentId,
    rootId: options.rootId,
    title: rootTitle,
    now: options.now,
  });
  const stack: StackItem[] = [{ level: -1, nodeId: document.rootId }];
  let lastNodeId = document.rootId;

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (index === firstHeadingIndex) continue;

    const note = raw.match(/^\s*>\s?(.*)$/);
    if (note) {
      const quoteLines: string[] = [];
      while (index < lines.length) {
        const quote = lines[index].match(/^\s*>\s?(.*)$/);
        if (!quote) break;
        quoteLines.push(quote[1]);
        index += 1;
      }
      index -= 1;
      appendNote(document, lastNodeId, quoteLines);
      continue;
    }

    const image = trimmed.match(imagePattern);
    if (image) {
      appendImage(document, lastNodeId, image[1], image[2]);
      continue;
    }

    if (/^\|.*\|$/.test(trimmed)) {
      const tableLines: string[] = [];
      while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index])) {
        tableLines.push(lines[index].trim());
        index += 1;
      }
      index -= 1;
      appendTable(document, lastNodeId, tableLines);
      continue;
    }

    const bullet = raw.match(/^(\s*)[-*+]\s+(.+)$/);
    if (bullet) {
      const level = Math.floor(bullet[1].replaceAll('\t', '  ').length / 2);
      while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
      const parentId = stack[stack.length - 1]?.nodeId ?? document.rootId;
      const nodeId = appendNode(document, parentId, parseContentBlock(bullet[2]));
      stack.push({ level, nodeId });
      lastNodeId = nodeId;
      continue;
    }

    const block = parseContentBlock(trimmed);
    const nodeId = appendNode(document, document.rootId, block);
    stack.length = 1;
    stack.push({ level: 0, nodeId });
    lastNodeId = nodeId;
  }

  return document;
}
