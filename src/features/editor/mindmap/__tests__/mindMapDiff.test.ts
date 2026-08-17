import { describe, expect, it } from 'vitest';
import {
  createDocument,
  createDocumentStore,
  documentCommands,
  reduceDocument,
  validateDocument,
  type DocumentCommand,
  type ZhiJianDocument,
} from '../../core';
import { documentToMindMapData } from '../mindMapAdapter';
import { diffMindMapChangeToCommands } from '../mindMapDiff';
import { applyMindMapDataChange } from '../mindMapEvents';
import type { MindMapViewNode } from '../mindMapTypes';

function createABC(): ZhiJianDocument {
  let document = createDocument({ id: 'doc', rootId: 'root', title: 'Root', now: 1 });
  ['a', 'b', 'c'].forEach((id) => {
    document = reduceDocument(document, documentCommands.createNode({
      type: 'createNode',
      parentId: 'root',
      node: { id, content: id.toUpperCase() },
    }));
  });
  return document;
}

function applyCommands(document: ZhiJianDocument, commands: DocumentCommand[]): ZhiJianDocument {
  return commands.reduce((current, command) => reduceDocument(current, command), document);
}

function child(id: string, text = id.toUpperCase(), children: MindMapViewNode[] = []): MindMapViewNode {
  return {
    data: { uid: id, id, text, richText: false, _blockType: 'text' },
    children,
  };
}

function root(children: MindMapViewNode[]): MindMapViewNode {
  return {
    data: { uid: 'root', id: 'root', text: 'Root', richText: false, _blockType: 'root' },
    children,
  };
}

describe('diffMindMapChangeToCommands', () => {
  it('detects create and assigns a permanent ZhiJian id', () => {
    const document = createABC();
    const previous = documentToMindMapData(document);
    const next = root([child('a'), child('b'), child('c'), child('smm-temp', 'B')]);

    const result = diffMindMapChangeToCommands(document, previous, next, () => 'permanent-b');

    expect(result.commands).toContainEqual(documentCommands.createNode({
      type: 'createNode',
      parentId: 'root',
      index: 3,
      node: { id: 'permanent-b', content: 'B', blockType: 'text' },
    }));
  });

  it('detects delete as subtree delete command', () => {
    const document = createABC();
    const previous = documentToMindMapData(document);
    const next = root([child('a'), child('c')]);

    const result = diffMindMapChangeToCommands(document, previous, next);

    expect(result.commands).toEqual([documentCommands.deleteNode('b')]);
  });

  it('detects move into another parent', () => {
    const document = createABC();
    const previous = documentToMindMapData(document);
    const next = root([child('a', 'A', [child('b')]), child('c')]);

    const result = diffMindMapChangeToCommands(document, previous, next);

    expect(result.commands).toContainEqual(documentCommands.moveNode({ nodeId: 'b', parentId: 'a', index: 0 }));
  });

  it('detects reorder without changing node ids', () => {
    const document = createABC();
    const previous = documentToMindMapData(document);
    const next = root([child('c'), child('a'), child('b')]);

    const result = diffMindMapChangeToCommands(document, previous, next);
    const after = applyCommands(document, result.commands);

    expect(after.nodes.root.children).toEqual(['c', 'a', 'b']);
    expect(Object.keys(after.nodes).sort()).toEqual(['a', 'b', 'c', 'root']);
  });

  it('detects text update only as updateContent', () => {
    const document = createABC();
    const previous = documentToMindMapData(document);
    const next = root([child('a', 'Hello World'), child('b'), child('c')]);

    const result = diffMindMapChangeToCommands(document, previous, next);

    expect(result.commands).toEqual([
      documentCommands.updateContent('a', 'Hello World', { mergeKey: 'mindmap-content:a' }),
    ]);
  });

  it('detects todo, note, image, table and style writes', () => {
    const document = createABC();
    const previous = documentToMindMapData(document);
    const next = root([{
      data: {
        uid: 'a',
        id: 'a',
        text: 'A',
        richText: false,
        _blockType: 'heading2',
        _todo: true,
        _todoChecked: true,
        note: 'Note',
        _images: [{ id: 'img', url: 'https://example.com/img.png', title: 'Image' }],
        _table: { rows: 1, columns: 2, cells: [['A', 'B']] },
        color: '#165DFF',
        fillColor: '#E8F3FF',
      },
      children: [],
    }, child('b'), child('c')]);

    const result = diffMindMapChangeToCommands(document, previous, next);

    expect(result.commands).toContainEqual(documentCommands.setBlockType('a', 'heading2'));
    expect(result.commands).toContainEqual(documentCommands.setTodo('a', { enabled: true, checked: true }));
    expect(result.commands).toContainEqual(documentCommands.setNote('a', 'Note'));
    expect(result.commands).toContainEqual(documentCommands.setImages('a', [{ id: 'img', url: 'https://example.com/img.png', alt: 'Image', width: undefined, height: undefined }]));
    expect(result.commands).toContainEqual(documentCommands.setTable('a', { rows: [['A', 'B']] }));
    expect(result.commands).toContainEqual(documentCommands.setStyle('a', { color: '#165DFF', backgroundColor: '#E8F3FF' }));
  });

  it('ignores store-driven data_change and accepts user-driven data_change', () => {
    const store = createDocumentStore(createABC());
    const previousDataRef = { current: documentToMindMapData(store.getSnapshot().document) };
    const isApplyingStoreUpdateRef = { current: true };
    const next = root([child('a', 'A updated'), child('b'), child('c')]);

    expect(applyMindMapDataChange({ store, previousDataRef, isApplyingStoreUpdateRef, nextData: next })).toBe(false);
    expect(store.getSnapshot().document.nodes.a.content).toBe('A');

    isApplyingStoreUpdateRef.current = false;
    expect(applyMindMapDataChange({ store, previousDataRef, isApplyingStoreUpdateRef, nextData: next })).toBe(true);
    expect(store.getSnapshot().document.nodes.a.content).toBe('A updated');
  });
});

describe('MindMap and Outline shared DocumentStore integration', () => {
  it('shares updates through one store without view-switch conversion', () => {
    const store = createDocumentStore(createDocument({ id: 'doc', rootId: 'root', title: 'Root', now: 1 }));
    store.execute(documentCommands.createNode({
      type: 'createNode',
      parentId: 'root',
      node: { id: 'a', content: 'A' },
    }));

    expect(documentToMindMapData(store.getSnapshot().document).children?.map((node) => node.data.uid)).toEqual(['a']);

    const previousDataRef = { current: documentToMindMapData(store.getSnapshot().document) };
    const isApplyingStoreUpdateRef = { current: false };
    applyMindMapDataChange({
      store,
      previousDataRef,
      isApplyingStoreUpdateRef,
      nextData: root([child('a'), child('smm-new', 'B')]),
    });

    expect(store.getSnapshot().document.nodes.a.content).toBe('A');
    expect(store.getSnapshot().document.nodes.root.children).toHaveLength(2);
  });

  it('supports cross-view undo and redo in business operation order', () => {
    const store = createDocumentStore(createABC());
    store.execute(documentCommands.createNode({
      type: 'createNode',
      parentId: 'root',
      node: { id: 'outline-created', content: 'Outline' },
    }));

    const previousDataRef = { current: documentToMindMapData(store.getSnapshot().document) };
    const isApplyingStoreUpdateRef = { current: false };
    applyMindMapDataChange({
      store,
      previousDataRef,
      isApplyingStoreUpdateRef,
      nextData: root([child('a', 'A', [child('b')]), child('c'), child('outline-created', 'Outline')]),
    });
    store.execute(documentCommands.updateContent('outline-created', 'Edited in outline'));
    store.execute(documentCommands.deleteNode('c'));

    expect(store.getSnapshot().document.nodes.c).toBeUndefined();
    expect(store.undo()).toBe(true);
    expect(store.getSnapshot().document.nodes.c.content).toBe('C');
    expect(store.undo()).toBe(true);
    expect(store.getSnapshot().document.nodes['outline-created'].content).toBe('Outline');
    expect(store.undo()).toBe(true);
    expect(store.getSnapshot().document.nodes.b.parentId).toBe('root');
    expect(store.redo()).toBe(true);
    expect(store.getSnapshot().document.nodes.b.parentId).toBe('a');
    expect(validateDocument(store.getDocument()).valid).toBe(true);
  });

  it('keeps tree, ids and history stable across 100 view switches', () => {
    const store = createDocumentStore(createABC());
    const before = store.getSnapshot();

    for (let index = 0; index < 100; index += 1) {
      documentToMindMapData(store.getSnapshot().document);
    }

    expect(store.getSnapshot()).toBe(before);
    expect(store.getSnapshot().document.nodes.root.children).toEqual(['a', 'b', 'c']);
    expect(store.getSnapshot().history.undoStack).toHaveLength(0);
  });

  it('handles 1000 nodes for adapter, update, undo and redo baseline', () => {
    const startedAt = performance.now();
    let document = createDocument({ id: 'large', rootId: 'root', title: 'Large', now: 1 });
    for (let index = 0; index < 1000; index += 1) {
      document = reduceDocument(document, documentCommands.createNode({
        type: 'createNode',
        parentId: 'root',
        node: { id: `node-${index}`, content: `Node ${index}` },
      }));
    }
    const store = createDocumentStore(document);
    const previousDataRef = { current: documentToMindMapData(store.getSnapshot().document) };
    const isApplyingStoreUpdateRef = { current: false };

    store.execute(documentCommands.updateContent('node-0', 'Outline updated'));
    previousDataRef.current = documentToMindMapData(store.getSnapshot().document);
    applyMindMapDataChange({
      store,
      previousDataRef,
      isApplyingStoreUpdateRef,
      nextData: {
        ...previousDataRef.current,
        children: [
          ...(previousDataRef.current.children ?? []).slice(1),
          (previousDataRef.current.children ?? [])[0],
        ],
      },
    });
    expect(store.undo()).toBe(true);
    expect(store.redo()).toBe(true);

    const elapsedMs = performance.now() - startedAt;
    console.info(`1000-node mindmap adapter baseline: ${elapsedMs.toFixed(2)}ms`);
    expect(validateDocument(store.getDocument()).valid).toBe(true);
    expect(documentToMindMapData(store.getSnapshot().document).children).toHaveLength(1000);
  });
});
