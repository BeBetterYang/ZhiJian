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

  it('keeps markdown output stable across document -> markdown -> document -> markdown', () => {
    const document = parseMarkdown(fullFeatureMarkdown, { documentId: 'doc', rootId: 'root', now: 1 });
    const firstPass = serializeMarkdown(document);
    const reparsed = parseMarkdown(firstPass, { documentId: 'doc', rootId: 'root', now: 1 });
    const secondPass = serializeMarkdown(reparsed);

    expect(secondPass).toBe(firstPass);
  });

  it('parses root child as top-level block and bullet as descendant', () => {
    const markdown = '# Root\n\n产品\n- Web\n- App\n  - iOS\n';
    const document = parseMarkdown(markdown, { documentId: 'doc', rootId: 'root', now: 1 });

    expect(document.nodes.root.children).toHaveLength(1);
    const productId = document.nodes.root.children[0];
    const product = document.nodes[productId];
    expect(product.content).toBe('产品');
    expect(product.children).toHaveLength(2);
    const [webId, appId] = product.children;
    expect(document.nodes[webId].content).toBe('Web');
    expect(document.nodes[webId].parentId).toBe(productId);
    expect(document.nodes[appId].content).toBe('App');
    expect(document.nodes[appId].parentId).toBe(productId);
    expect(document.nodes[appId].children).toHaveLength(1);
    const iosId = document.nodes[appId].children[0];
    expect(document.nodes[iosId].content).toBe('iOS');
    expect(document.nodes[iosId].parentId).toBe(appId);
  });

  it('round trips root child without bullet through document -> markdown -> document', () => {
    const markdown = '# Root\n\n产品\n- Web\n- App\n';
    const document = parseMarkdown(markdown, { documentId: 'doc', rootId: 'root', now: 1 });
    const serialized = serializeMarkdown(document);

    expect(serialized).toBe('# Root\n\n产品\n- Web\n- App\n');
  });
});
