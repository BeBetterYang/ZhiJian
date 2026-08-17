import type { NodeId, ZhiJianDocument, ZhiJianNode } from '../core';
import { escapeMarkdownTableCell, sanitizeMarkdownUrl, stripDangerousInlineHtml } from './inlineMarkdown';

function headingPrefix(node: ZhiJianNode): string {
  if (node.blockType === 'heading1') return '# ';
  if (node.blockType === 'heading2') return '## ';
  if (node.blockType === 'heading3') return '### ';
  return '';
}

function todoPrefix(node: ZhiJianNode): string {
  if (!node.todo?.enabled) return '';
  return node.todo.checked ? '[x] ' : '[ ] ';
}

function serializeNodeLine(node: ZhiJianNode): string {
  return `${todoPrefix(node)}${headingPrefix(node)}${stripDangerousInlineHtml(node.content)}`.trim();
}

function appendAttachments(lines: string[], node: ZhiJianNode, indent: string): void {
  if (node.note) {
    stripDangerousInlineHtml(node.note).split('\n').forEach((line) => lines.push(`${indent}> ${line}`));
  }
  if (node.images?.length) {
    node.images.forEach((image, index) => {
      const alt = stripDangerousInlineHtml(image.alt || `image ${index + 1}`).replaceAll('[', '').replaceAll(']', '');
      lines.push(`${indent}![${alt}](${sanitizeMarkdownUrl(image.url)})`);
    });
  }
  if (node.table?.rows.length) {
    const columns = Math.max(1, ...node.table.rows.map((row) => row.length));
    const rows = node.table.rows.map((row) => Array.from({ length: columns }, (_, column) => escapeMarkdownTableCell(stripDangerousInlineHtml(row[column] ?? ''))));
    lines.push(`${indent}| ${rows[0].join(' | ')} |`);
    lines.push(`${indent}| ${Array.from({ length: columns }, () => '---').join(' | ')} |`);
    rows.slice(1).forEach((row) => lines.push(`${indent}| ${row.join(' | ')} |`));
  }
}

function serializeDescendant(document: ZhiJianDocument, nodeId: NodeId, depth: number, lines: string[]): void {
  const node = document.nodes[nodeId];
  if (!node) return;
  const indent = '  '.repeat(depth);
  lines.push(`${indent}- ${serializeNodeLine(node)}`);
  appendAttachments(lines, node, `${indent}  `);
  node.children.forEach((childId) => serializeDescendant(document, childId, depth + 1, lines));
}

// Root 的直接 child 始终表现为顶级 Block（无 bullet），其 descendants 才使用 `-` 列表项
function serializeRootChild(document: ZhiJianDocument, nodeId: NodeId, lines: string[]): void {
  const node = document.nodes[nodeId];
  if (!node) return;
  lines.push(serializeNodeLine(node));
  appendAttachments(lines, node, '');
  node.children.forEach((childId) => serializeDescendant(document, childId, 0, lines));
}

export function serializeMarkdown(document: ZhiJianDocument): string {
  const root = document.nodes[document.rootId];
  const lines = [`# ${stripDangerousInlineHtml(root?.content || document.title || '未命名')}`, ''];
  appendAttachments(lines, root, '');
  root.children.forEach((childId) => {
    serializeRootChild(document, childId, lines);
    lines.push('');
  });
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}
