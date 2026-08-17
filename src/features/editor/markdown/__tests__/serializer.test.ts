import { describe, expect, it } from 'vitest';
import { createDocument, documentCommands, reduceDocument } from '../../core';
import { serializeMarkdown } from '../serializer';

function buildDocument(builder: (create: (parentId: string, input: { id: string; content: string; blockType?: 'text' | 'heading1' | 'heading2' | 'heading3'; todo?: { enabled: true; checked: boolean }; note?: string; images?: Array<{ id: string; url: string; alt?: string }>; table?: { rows: string[][] } }) => string) => void): ReturnType<typeof createDocument> {
  let document = createDocument({ id: 'doc', rootId: 'root', title: 'Root', now: 1 });
  const create = (parentId: string, input: { id: string; content: string; blockType?: 'text' | 'heading1' | 'heading2' | 'heading3'; todo?: { enabled: true; checked: boolean }; note?: string; images?: Array<{ id: string; url: string; alt?: string }>; table?: { rows: string[][] } }): string => {
    document = reduceDocument(document, documentCommands.createNode({
      type: 'createNode',
      parentId,
      node: input,
    }), { now: document.updatedAt + 1 });
    return input.id;
  };
  builder(create);
  return document;
}

describe('serializeMarkdown', () => {
  it('serializes root, heading, todo, note, image and table from ZhiJianDocument', () => {
    let document = createDocument({ id: 'doc', rootId: 'root', title: 'Root', now: 1 });
    document = reduceDocument(document, documentCommands.createNode({
      type: 'createNode',
      parentId: 'root',
      node: {
        id: 'a',
        content: 'A **bold**',
        blockType: 'heading2',
        todo: { enabled: true, checked: true },
        note: 'Note',
        images: [{ id: 'image', url: 'https://example.com/a.png', alt: 'A' }],
        table: { rows: [['A', 'B'], ['1', '2']] },
      },
    }));

    const markdown = serializeMarkdown(document);

    expect(markdown).toContain('# Root');
    // Root direct child 始终是顶级 Block（无 bullet），即使它是 Todo + heading
    expect(markdown).toContain('[x] ## A **bold**');
    expect(markdown).not.toContain('- [x] ## A **bold**');
    expect(markdown).toContain('> Note');
    expect(markdown).toContain('![A](https://example.com/a.png)');
    expect(markdown).toContain('| A | B |');
  });

  it('emits root child without bullet even when it has children', () => {
    const document = buildDocument((create) => {
      create('root', { id: 'product', content: '产品' });
      create('product', { id: 'web', content: 'Web' });
      create('product', { id: 'app', content: 'App' });
    });

    const markdown = serializeMarkdown(document);

    expect(markdown).toContain('产品');
    expect(markdown).not.toContain('- 产品');
    expect(markdown).toContain('- Web');
    expect(markdown).toContain('- App');
  });

  it('indents descendants by 2 spaces per depth level', () => {
    const document = buildDocument((create) => {
      create('root', { id: 'product', content: '产品' });
      create('product', { id: 'app', content: 'App' });
      create('app', { id: 'ios', content: 'iOS' });
    });

    const markdown = serializeMarkdown(document);

    const lines = markdown.split('\n');
    expect(lines).toContain('产品');
    expect(lines).toContain('- App');
    expect(lines).toContain('  - iOS');
  });

  it('serializes root heading child as top-level block, not bullet', () => {
    const document = buildDocument((create) => {
      create('root', { id: 'h1', content: '标题1', blockType: 'heading1' });
      create('h1', { id: 'child', content: '子节点' });
      create('root', { id: 'text', content: '正文' });
    });

    const markdown = serializeMarkdown(document);

    const lines = markdown.split('\n');
    expect(lines).toContain('# 标题1');
    expect(lines).toContain('- 子节点');
    expect(lines).toContain('正文');
    expect(lines).not.toContain('- # 标题1');
  });

  it('keeps root child todo as top-level block without bullet', () => {
    const document = buildDocument((create) => {
      create('root', { id: 'task', content: '任务', todo: { enabled: true, checked: false } });
    });

    const markdown = serializeMarkdown(document);

    const lines = markdown.split('\n');
    expect(lines).toContain('[ ] 任务');
    expect(lines).not.toContain('- [ ] 任务');
  });

  it('indents note/image/table attachments with the owning node', () => {
    const document = buildDocument((create) => {
      // root child 直接带 note：附件无缩进
      create('root', { id: 'rootNote', content: '根说明', note: '顶层批注' });
      create('root', { id: 'product', content: '产品' });
      // descendant 带图片/表格：附件缩进跟随 owner
      create('product', { id: 'img', content: '图片节点', images: [{ id: 'img1', url: 'https://example.com/image.png', alt: '图片' }] });
      create('product', { id: 'tbl', content: '表格测试', table: { rows: [['A', 'B'], ['1', '2']] } });
    });

    const markdown = serializeMarkdown(document);
    const lines = markdown.split('\n');

    // root child 附件无缩进
    expect(lines).toContain('根说明');
    expect(lines).toContain('> 顶层批注');
    // descendant 行带 bullet
    expect(lines).toContain('- 图片节点');
    expect(lines).toContain('- 表格测试');
    // descendant 附件缩进 2 空格（depth 0 owner）
    expect(lines).toContain('  ![图片](https://example.com/image.png)');
    expect(lines).toContain('  | A | B |');
  });
});
