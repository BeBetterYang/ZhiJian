import {
  createDocument,
  createId,
  createNode,
  type CreateNodeInput,
  type NodeId,
  type ZhiJianContentBlockType,
  type ZhiJianDocument,
  type ZhiJianImage,
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
    todo = { checked: todoMatch[1].toLowerCase() === 'x' };
    source = todoMatch[2].trim();
  }
  const heading = source.match(/^(#{1,3})\s+(.+)$/);
  const blockType: ZhiJianContentBlockType = heading
    ? (`heading${heading[1].length}` as ZhiJianContentBlockType)
    : 'text';
  const content = sanitizeInlineMarkdown(heading ? heading[2].trim() : source);
  return { content, blockType, todo };
}

function appendNode(document: ZhiJianDocument, parentId: NodeId, input: CreateNodeInput): NodeId {
  const id = input.id ?? createId();
  const parent = document.nodes[parentId];
  if (!parent) throw new Error(`Parent "${parentId}" does not exist.`);
  document.nodes[id] = createNode({ ...input, id, parentId });
  document.nodes[parentId] = {
    ...parent,
    children: [...parent.children, id],
  };
  return id;
}

function appendDescription(document: ZhiJianDocument, nodeId: NodeId, descriptionLines: string[]): void {
  const node = document.nodes[nodeId];
  if (!node || node.kind !== 'content') return;
  const nextDescription = descriptionLines.map((line) => stripDangerousInlineHtml(line)).join('\n').trim();
  if (!nextDescription) return;
  document.nodes[nodeId] = {
    ...node,
    description: node.description ? `${node.description}\n${nextDescription}` : nextDescription,
  };
}

function appendImage(document: ZhiJianDocument, nodeId: NodeId, alt: string, url: string): void {
  const node = document.nodes[nodeId];
  if (!node || node.kind !== 'content') return;
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

function appendTableNode(document: ZhiJianDocument, parentId: NodeId, tableLines: string[]): NodeId | null {
  const rows = tableLines
    .map(splitMarkdownTableRow)
    .filter((cells) => !isMarkdownTableSeparator(cells));
  if (rows.length === 0) return null;
  return appendNode(document, parentId, { id: createId(), kind: 'table', table: { rows } });
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

    const description = raw.match(/^\s*>\s?(.*)$/);
    if (description) {
      const quoteLines: string[] = [];
      while (index < lines.length) {
        const quote = lines[index].match(/^\s*>\s?(.*)$/);
        if (!quote) break;
        quoteLines.push(quote[1]);
        index += 1;
      }
      index -= 1;
      appendDescription(document, lastNodeId, quoteLines);
      continue;
    }

    const image = trimmed.match(imagePattern);
    if (image) {
      appendImage(document, lastNodeId, image[1], image[2]);
      continue;
    }

    if (/^\|.*\|$/.test(trimmed)) {
      const startIndent = raw.match(/^(\s*)/)?.[1] ?? '';
      const level = Math.floor(startIndent.replaceAll('\t', '  ').length / 2);
      const tableLines: string[] = [];
      while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index])) {
        tableLines.push(lines[index].trim());
        index += 1;
      }
      index -= 1;
      while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
      const parentId = stack[stack.length - 1]?.nodeId ?? document.rootId;
      const tableId = appendTableNode(document, parentId, tableLines);
      if (tableId) {
        stack.push({ level, nodeId: tableId });
        lastNodeId = tableId;
      }
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
    // 顶级 Block 在 stack 中保持 level -1：bullet (level>=0) 不会弹出它，
    // 紧随其后的 `- xxx` 会作为该 Block 的 child，而非 Root 的兄弟
    stack.push({ level: -1, nodeId });
    lastNodeId = nodeId;
  }

  return document;
}
