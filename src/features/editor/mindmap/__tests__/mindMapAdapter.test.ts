import { describe, expect, it } from 'vitest';
import {
  createDocument,
  documentCommands,
  reduceDocument,
  type ZhiJianDocument,
} from '../../core';
import { documentToMindMapData } from '../mindMapAdapter';

function createFixtureDocument(): ZhiJianDocument {
  let document = createDocument({ id: 'doc', rootId: 'root', title: 'Root', now: 1 });
  document = reduceDocument(document, documentCommands.createNode({
    type: 'createNode',
    parentId: 'root',
    node: {
      id: 'a',
      content: 'A',
      blockType: 'heading1',
      todo: { enabled: true, checked: false },
      note: 'Note A',
      images: [{ id: 'image-a', url: 'https://example.com/a.png', alt: 'A image', width: 100, height: 80 }],
      table: { rows: [['1', '2'], ['3', '4']] },
      style: { color: '#165DFF', backgroundColor: '#E8F3FF' },
    },
  }));
  document = reduceDocument(document, documentCommands.createNode({
    type: 'createNode',
    parentId: 'a',
    node: { id: 'a1', content: 'A1', blockType: 'heading3' },
  }));
  document = reduceDocument(document, documentCommands.createNode({
    type: 'createNode',
    parentId: 'a',
    node: { id: 'a2', content: 'A2' },
  }));
  document = reduceDocument(document, documentCommands.createNode({
    type: 'createNode',
    parentId: 'root',
    node: { id: 'b', content: 'B' },
  }));
  return document;
}

describe('documentToMindMapData', () => {
  it('keeps id, text, parent order and children structure', () => {
    const data = documentToMindMapData(createFixtureDocument());

    expect(data.data.uid).toBe('root');
    expect(data.data.text).toBe('Root');
    expect(data.children?.map((child) => child.data.uid)).toEqual(['a', 'b']);
    expect(data.children?.[0].children?.map((child) => child.data.uid)).toEqual(['a1', 'a2']);
    expect(data.children?.[1].children).toEqual([]);
  });

  it('maps node properties without turning attachments into tree nodes', () => {
    const data = documentToMindMapData(createFixtureDocument());
    const a = data.children?.[0];

    expect(a?.data._blockType).toBe('heading1');
    expect(a?.data._todo).toBe(true);
    expect(a?.data._todoChecked).toBe(false);
    expect(a?.data.note).toBe('Note A');
    expect(a?.data._images).toEqual([{ id: 'image-a', url: 'https://example.com/a.png', title: 'A image', alt: 'A image', width: 100, height: 80 }]);
    expect(a?.data._table).toEqual({ rows: 2, columns: 2, cells: [['1', '2'], ['3', '4']] });
    expect(a?.data.color).toBe('#165DFF');
    expect(a?.data.fillColor).toBe('#E8F3FF');
    expect(a?.children).toHaveLength(2);
  });
});
