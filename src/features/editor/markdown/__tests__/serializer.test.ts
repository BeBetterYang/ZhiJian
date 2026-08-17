import { describe, expect, it } from 'vitest';
import { createDocument, documentCommands, reduceDocument } from '../../core';
import { serializeMarkdown } from '../serializer';

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
    expect(markdown).toContain('- [x] ## A **bold**');
    expect(markdown).toContain('> Note');
    expect(markdown).toContain('![A](https://example.com/a.png)');
    expect(markdown).toContain('| A | B |');
  });
});
