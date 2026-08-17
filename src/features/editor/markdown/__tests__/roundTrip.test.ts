import { describe, expect, it } from 'vitest';
import fullFeatureMarkdown from '../__fixtures__/full-feature.md?raw';
import { parseMarkdown } from '../parser';
import { serializeMarkdown } from '../serializer';

function semanticSnapshot(markdown: string) {
  const document = parseMarkdown(markdown, { documentId: 'doc', rootId: 'root', now: 1 });
  const pathOf = (nodeId: string | null): string => {
    if (!nodeId) return '';
    const node = document.nodes[nodeId];
    if (!node) return '';
    if (node.id === document.rootId) return 'root';
    return `${pathOf(node.parentId)}/${node.content}`;
  };
  return {
    title: document.title,
    nodes: Object.values(document.nodes)
      .map((node) => ({
        content: node.content,
        blockType: node.blockType,
        parentPath: pathOf(node.parentId),
        childrenCount: node.children.length,
        todo: node.todo,
        note: node.note,
        images: node.images?.map((image) => ({ url: image.url, alt: image.alt })),
        table: node.table,
      }))
      .sort((a, b) => `${a.parentPath}:${a.content}`.localeCompare(`${b.parentPath}:${b.content}`)),
  };
}

describe('Markdown round trip', () => {
  it('preserves full fixture semantics across markdown -> document -> markdown -> document', () => {
    const document = parseMarkdown(fullFeatureMarkdown, { documentId: 'doc', rootId: 'root', now: 1 });
    const serialized = serializeMarkdown(document);

    expect(semanticSnapshot(serialized)).toEqual(semanticSnapshot(fullFeatureMarkdown));
  });
});
