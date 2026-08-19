import { isContentNode, type ContentNode, type NodeId, type TableNode, type ZhiJianDocument } from '../core';
import { escapeMarkdownTableCell, sanitizeMarkdownUrl, stripDangerousInlineHtml } from './inlineMarkdown';

function headingPrefix(node: ContentNode): string {
  if (node.blockType === 'heading1') return '# ';
  if (node.blockType === 'heading2') return '## ';
  if (node.blockType === 'heading3') return '### ';
  return '';
}

function todoPrefix(node: ContentNode): string {
  if (!node.todo) return '';
  return node.todo.checked ? '[x] ' : '[ ] ';
}

function serializeContentLine(node: ContentNode): string {
  return `${todoPrefix(node)}${headingPrefix(node)}${stripDangerousInlineHtml(node.content)}`.trim();
}

function appendContentAttachments(lines: string[], node: ContentNode, indent: string): void {
  if (node.description) {
    stripDangerousInlineHtml(node.description).split('\n').forEach((line) => lines.push(`${indent}> ${line}`));
  }
  if (node.images?.length) {
    node.images.forEach((image, index) => {
      const alt = stripDangerousInlineHtml(image.alt || `image ${index + 1}`).replaceAll('[', '').replaceAll(']', '');
      lines.push(`${indent}![${alt}](${sanitizeMarkdownUrl(image.url)})`);
    });
  }
}

function serializeTableBlock(lines: string[], node: TableNode, indent: string): void {
  const sourceRows = node.table.rows;
  if (sourceRows.length === 0) return;
  const columns = Math.max(1, ...sourceRows.map((row) => row.length));
  const rows = sourceRows.map((row) =>
    Array.from({ length: columns }, (_, column) => escapeMarkdownTableCell(stripDangerousInlineHtml(row[column] ?? ''))));
  lines.push(`${indent}| ${rows[0].join(' | ')} |`);
  lines.push(`${indent}| ${Array.from({ length: columns }, () => '---').join(' | ')} |`);
  rows.slice(1).forEach((row) => lines.push(`${indent}| ${row.join(' | ')} |`));
}

function serializeDescendant(document: ZhiJianDocument, nodeId: NodeId, depth: number, lines: string[]): void {
  const node = document.nodes[nodeId];
  if (!node) return;
  const indent = '  '.repeat(depth);
  if (node.kind === 'table') {
    serializeTableBlock(lines, node, indent);
  } else {
    lines.push(`${indent}- ${serializeContentLine(node)}`);
    appendContentAttachments(lines, node, `${indent}  `);
  }
  node.children.forEach((childId) => serializeDescendant(document, childId, depth + 1, lines));
}

// Root 的直接 child 始终表现为顶级 Block（无 bullet），其 descendants 才使用 `-` 列表项
function serializeRootChild(document: ZhiJianDocument, nodeId: NodeId, lines: string[]): void {
  const node = document.nodes[nodeId];
  if (!node) return;
  if (node.kind === 'table') {
    serializeTableBlock(lines, node, '');
  } else {
    lines.push(serializeContentLine(node));
    appendContentAttachments(lines, node, '');
  }
  node.children.forEach((childId) => serializeDescendant(document, childId, 0, lines));
}

export function serializeMarkdown(document: ZhiJianDocument): string {
  const root = document.nodes[document.rootId];
  const rootContent = root && isContentNode(root) ? root.content : '';
  const lines = [`# ${stripDangerousInlineHtml(rootContent || document.title || '未命名')}`, ''];
  if (root && isContentNode(root)) appendContentAttachments(lines, root, '');
  root?.children.forEach((childId) => {
    serializeRootChild(document, childId, lines);
    lines.push('');
  });
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}
