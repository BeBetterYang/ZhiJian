import { describe, expect, it } from 'vitest';
import fullFeatureMarkdown from '../__fixtures__/full-feature.md?raw';
import { parseMarkdown } from '../parser';
import { validateDocument } from '../../core';

describe('parseMarkdown', () => {
  it('parses root, flat blocks, headings, todo, note, image, table and nested tree', () => {
    const document = parseMarkdown(fullFeatureMarkdown, { documentId: 'doc', rootId: 'root', now: 1 });

    expect(validateDocument(document).valid).toBe(true);
    expect(document.nodes.root.content).toBe('新手入门');
    expect(document.nodes.root.blockType).toBe('root');
    expect(document.nodes.root.children).toHaveLength(7);

    const [textId, h1Id, h2Id, h3Id, todoOpenId, todoDoneId] = document.nodes.root.children;
    expect(document.nodes[textId].content).toContain('**bold**');
    expect(document.nodes[h1Id].blockType).toBe('heading1');
    expect(document.nodes[h2Id].blockType).toBe('heading2');
    expect(document.nodes[h3Id].blockType).toBe('heading3');
    expect(document.nodes[todoOpenId].todo).toEqual({ enabled: true, checked: false });
    expect(document.nodes[todoDoneId].todo).toEqual({ enabled: true, checked: true });

    const productId = document.nodes.root.children[6];
    const product = document.nodes[productId];
    expect(product.content).toBe('产品设计');
    expect(product.children).toHaveLength(4);
    const chinese = document.nodes[product.children[3]];
    expect(chinese.content).toBe('中文节点');
    expect(chinese.note).toBe('这是描述');
    expect(chinese.images?.[0]).toMatchObject({ url: 'https://example.com/image.png', alt: '示例图片' });
    expect(chinese.table).toEqual({ rows: [['A', 'B'], ['1', '2']] });
  });

  it('treats heading marker as block type, not tree level', () => {
    const document = parseMarkdown('# Root\n\n# H1\n\n## H2\n\n### H3\n\nText', { rootId: 'root', now: 1 });

    expect(document.nodes.root.children.map((id) => document.nodes[id].blockType)).toEqual(['heading1', 'heading2', 'heading3', 'text']);
  });

  it('sanitizes dangerous html and javascript links', () => {
    const document = parseMarkdown('# Root\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[bad](javascript:alert(1))', { rootId: 'root', now: 1 });
    const contents = document.nodes.root.children.map((id) => document.nodes[id].content).join('\n');

    expect(contents).not.toContain('<script>');
    expect(contents).not.toContain('onerror');
    expect(contents).toContain('[bad](#)');
  });
});
