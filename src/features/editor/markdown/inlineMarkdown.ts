const unsafeProtocol = /^\s*javascript:/i;

export function stripDangerousInlineHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/href\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, 'href="#"')
    .replace(/src\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, 'src="#"');
}

export function sanitizeMarkdownUrl(value: string): string {
  const trimmed = value.trim();
  return unsafeProtocol.test(trimmed) ? '#' : trimmed;
}

export function sanitizeInlineMarkdown(value: string): string {
  return stripDangerousInlineHtml(value).replace(/\[([^\]]+)]\(([^)]+)\)/g, (_match, label: string, url: string) => {
    return `[${label}](${sanitizeMarkdownUrl(url)})`;
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function normalizeMarkdownBoldHtml(value: string): string {
  if (typeof document === 'undefined' || !/(\*\*.+?\*\*|__.+?__)/.test(value)) return value;
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

export function escapeMarkdownTableCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

export function splitMarkdownTableRow(line: string): string[] {
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
      cells.push(stripDangerousInlineHtml(value.trim()));
      value = '';
    } else {
      value += character;
    }
  }
  cells.push(stripDangerousInlineHtml(value.trim()));
  return cells;
}

export function isMarkdownTableSeparator(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}
