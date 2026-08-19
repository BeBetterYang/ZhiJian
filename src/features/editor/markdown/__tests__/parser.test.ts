import { describe, expect, it } from 'vitest';
import fullFeatureMarkdown from '../__fixtures__/full-feature.md?raw';
import { parseMarkdown } from '../parser';
import { getNode, validateDocument, type ContentNode, type ZhiJianDocument } from '../../core';

function contentNode(document: ZhiJianDocument, id: string): ContentNode {
  const node = getNode(document, id);
  if (node.kind !== 'content') throw new Error(`expected content node: ${id}`);
  return node;
}

describe('parseMarkdown', () => {
  it('parses root, flat blocks, headings, todo, description, image, table and nested tree', () => {
    const document = parseMarkdown(fullFeatureMarkdown, { documentId: 'doc', rootId: 'root', now: 1 });

    expect(validateDocument(document).valid).toBe(true);
    expect(contentNode(document, 'root').content).toBe('新手入门');
    expect(contentNode(document, 'root').blockType).toBe('root');
    expect(document.nodes.root.children).toHaveLength(7);

    const [textId, h1Id, h2Id, h3Id, todoOpenId, todoDoneId] = document.nodes.root.children;
    expect(contentNode(document, textId).content).toContain('**bold**');
    expect(contentNode(document, h1Id).blockType).toBe('heading1');
    expect(contentNode(document, h2Id).blockType).toBe('heading2');
    expect(contentNode(document, h3Id).blockType).toBe('heading3');
    expect(contentNode(document, todoOpenId).todo).toEqual({ checked: false });
    expect(contentNode(document, todoDoneId).todo).toEqual({ checked: true });

    const productId = document.nodes.root.children[6];
    const product = contentNode(document, productId);
    expect(product.content).toBe('产品设计');
    expect(product.children).toHaveLength(4);

    const chinese = contentNode(document, product.children[3]);
    expect(chinese.content).toBe('中文节点');
    expect(chinese.description).toBe('这是描述');
    expect(chinese.images?.[0]).toMatchObject({ url: 'https://example.com/image.png', alt: '示例图片' });

    // 表格作为独立的 TableNode child 挂在其 owner 节点下
    expect(chinese.children).toHaveLength(1);
    const table = getNode(document, chinese.children[0]);
    expect(table.kind).toBe('table');
    if (table.kind === 'table') {
      expect(table.table).toEqual({ rows: [['A', 'B'], ['1', '2']] });
    }
  });

  it('treats heading marker as block type, not tree level', () => {
    const document = parseMarkdown('# Root\n\n# H1\n\n## H2\n\n### H3\n\nText', { rootId: 'root', now: 1 });

    expect(document.nodes.root.children.map((id) => contentNode(document, id).blockType))
      .toEqual(['heading1', 'heading2', 'heading3', 'text']);
  });

  it('sanitizes dangerous html and javascript links', () => {
    const document = parseMarkdown('# Root\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[bad](javascript:alert(1))', { rootId: 'root', now: 1 });
    const contents = document.nodes.root.children.map((id) => contentNode(document, id).content).join('\n');

    expect(contents).not.toContain('<script>');
    expect(contents).not.toContain('onerror');
    expect(contents).toContain('[bad](#)');
  });
});
