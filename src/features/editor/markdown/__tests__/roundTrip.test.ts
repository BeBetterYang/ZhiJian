import { describe, expect, it } from 'vitest';
import fullFeatureMarkdown from '../__fixtures__/full-feature.md?raw';
import { parseMarkdown } from '../parser';
import { serializeMarkdown } from '../serializer';
import { getNodeBlockType, getNodeContent } from '../../core';

function semanticSnapshot(markdown: string) {
  const document = parseMarkdown(markdown, { documentId: 'doc', rootId: 'root', now: 1 });
  const pathOf = (nodeId: string | null): string => {
    if (!nodeId) return '';
    const node = document.nodes[nodeId];
    if (!node) return '';
    if (node.id === document.rootId) return 'root';
    return `${pathOf(node.parentId)}/${getNodeContent(node)}`;
  };
  return {
    title: document.title,
    nodes: Object.values(document.nodes)
      .map((node) => ({
        kind: node.kind,
        content: getNodeContent(node),
        blockType: getNodeBlockType(node),
        parentPath: pathOf(node.parentId),
        childrenCount: node.children.length,
        description: node.kind === 'content' ? node.description : undefined,
        todo: node.kind === 'content' ? node.todo : undefined,
        images: node.kind === 'content' ? node.images?.map((image) => ({ url: image.url, alt: image.alt })) : undefined,
        table: node.kind === 'table' ? node.table : undefined,
      }))
      .sort((a, b) => `${a.parentPath}:${a.content}:${a.kind}`.localeCompare(`${b.parentPath}:${b.content}:${b.kind}`)),
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
    expect(getNodeContent(product)).toBe('产品');
    expect(product.children).toHaveLength(2);
    const [webId, appId] = product.children;
    expect(getNodeContent(document.nodes[webId])).toBe('Web');
    expect(document.nodes[webId].parentId).toBe(productId);
    expect(getNodeContent(document.nodes[appId])).toBe('App');
    expect(document.nodes[appId].parentId).toBe(productId);
    expect(document.nodes[appId].children).toHaveLength(1);
    const iosId = document.nodes[appId].children[0];
    expect(getNodeContent(document.nodes[iosId])).toBe('iOS');
    expect(document.nodes[iosId].parentId).toBe(appId);
  });

  it('round trips root child without bullet through document -> markdown -> document', () => {
    const markdown = '# Root\n\n产品\n- Web\n- App\n';
    const document = parseMarkdown(markdown, { documentId: 'doc', rootId: 'root', now: 1 });
    const serialized = serializeMarkdown(document);

    expect(serialized).toBe('# Root\n\n产品\n- Web\n- App\n');
  });
});
