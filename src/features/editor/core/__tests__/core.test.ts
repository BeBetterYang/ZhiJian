import { describe, expect, it } from 'vitest';
import {
  createDocument,
  createDocumentStore,
  documentCommands,
  reduceDocument,
  validateDocument,
  type ZhiJianDocument,
} from '../index';

function createFixtureDocument(): ZhiJianDocument {
  let document = createDocument({ id: 'doc', rootId: 'root', title: '新手入门', now: 1 });
  document = reduceDocument(document, documentCommands.createNode({
    type: 'createNode',
    parentId: 'root',
    node: { id: 'a', content: 'A' },
  }), { now: 2 });
  document = reduceDocument(document, documentCommands.createNode({
    type: 'createNode',
    parentId: 'root',
    node: { id: 'b', content: 'B' },
  }), { now: 3 });
  document = reduceDocument(document, documentCommands.createNode({
    type: 'createNode',
    parentId: 'a',
    node: { id: 'a1', content: 'A1' },
  }), { now: 4 });
  return document;
}

describe('ZhiJian core document', () => {
  it('creates a normalized document with a stable root', () => {
    const document = createDocument({ id: 'doc', rootId: 'root', title: '新手入门', now: 100 });

    expect(document.rootId).toBe('root');
    expect(document.nodes.root.parentId).toBeNull();
    expect(document.nodes.root.content).toBe('新手入门');
    expect(document.nodes.root.blockType).toBe('heading2');
    expect(validateDocument(document).valid).toBe(true);
  });

  it('supports createNode and deleteNode with subtree removal', () => {
    const document = createFixtureDocument();
    const next = reduceDocument(document, documentCommands.deleteNode('a'));

    expect(next.nodes.a).toBeUndefined();
    expect(next.nodes.a1).toBeUndefined();
    expect(next.nodes.root.children).toEqual(['b']);
    expect(validateDocument(next).valid).toBe(true);
  });

  it('supports moveNode and reorderNode through one normalized tree', () => {
    let document = createFixtureDocument();
    document = reduceDocument(document, documentCommands.moveNode({ nodeId: 'a1', parentId: 'root', index: 1 }));

    expect(document.nodes.a.children).toEqual([]);
    expect(document.nodes.a1.parentId).toBe('root');
    expect(document.nodes.root.children).toEqual(['a', 'a1', 'b']);

    document = reduceDocument(document, documentCommands.reorderNode('b', 0));
    expect(document.nodes.root.children).toEqual(['b', 'a', 'a1']);
    expect(validateDocument(document).valid).toBe(true);
  });

  it('supports indentNode and outdentNode', () => {
    let document = createFixtureDocument();

    document = reduceDocument(document, documentCommands.indentNode('b'));
    expect(document.nodes.b.parentId).toBe('a');
    expect(document.nodes.a.children).toEqual(['a1', 'b']);
    expect(document.nodes.root.children).toEqual(['a']);

    document = reduceDocument(document, documentCommands.outdentNode('b'));
    expect(document.nodes.b.parentId).toBe('root');
    expect(document.nodes.root.children).toEqual(['a', 'b']);
    expect(validateDocument(document).valid).toBe(true);
  });

  it('supports splitNode and mergeNode', () => {
    let document = createFixtureDocument();
    document = reduceDocument(document, documentCommands.updateContent('b', 'HelloWorld'));
    document = reduceDocument(document, documentCommands.splitNode('b', 5, 'b2'));

    expect(document.nodes.b.content).toBe('Hello');
    expect(document.nodes.b2.content).toBe('World');
    expect(document.nodes.root.children).toEqual(['a', 'b', 'b2']);

    document = reduceDocument(document, documentCommands.mergeNode('b2', 'b'));
    expect(document.nodes.b.content).toBe('HelloWorld');
    expect(document.nodes.b2).toBeUndefined();
    expect(document.nodes.root.children).toEqual(['a', 'b']);
  });

  it('prevents invalid moves and cycles', () => {
    const document = createFixtureDocument();

    expect(() => reduceDocument(document, documentCommands.moveNode({ nodeId: 'root', parentId: 'a', index: 0 })))
      .toThrow('Root node cannot be moved');
    expect(() => reduceDocument(document, documentCommands.moveNode({ nodeId: 'a', parentId: 'a1', index: 0 })))
      .toThrow('own descendant');
  });

  it('updates node properties through commands', () => {
    let document = createFixtureDocument();
    document = reduceDocument(document, documentCommands.setBlockType('a', 'heading1'));
    document = reduceDocument(document, documentCommands.setTodoChecked('a', true));
    document = reduceDocument(document, documentCommands.setNote('a', '描述'));
    document = reduceDocument(document, documentCommands.setImages('a', [{ id: 'image-1', url: 'https://example.com/a.png' }]));
    document = reduceDocument(document, documentCommands.setTable('a', { rows: [['1', '2'], ['3', '4']] }));
    document = reduceDocument(document, documentCommands.setStyle('a', { color: '#f00', backgroundColor: '#ff0' }));

    expect(document.nodes.a.blockType).toBe('heading1');
    expect(document.nodes.a.todo).toEqual({ enabled: true, checked: true });
    expect(document.nodes.a.note).toBe('描述');
    expect(document.nodes.a.images?.[0].id).toBe('image-1');
    expect(document.nodes.a.table?.rows[1]).toEqual(['3', '4']);
    expect(document.nodes.a.style?.color).toBe('#f00');
    expect(validateDocument(document).valid).toBe(true);
  });

  it('detects broken parent and child relationships', () => {
    const document = createFixtureDocument();
    const broken: ZhiJianDocument = {
      ...document,
      nodes: {
        ...document.nodes,
        a1: {
          ...document.nodes.a1,
          parentId: 'b',
        },
      },
    };

    const result = validateDocument(broken);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'PARENT_CHILD_MISMATCH')).toBe(true);
  });
});

describe('ZhiJian global history', () => {
  it('undoes and redoes commands across the document store', () => {
    const store = createDocumentStore(createDocument({ id: 'doc', rootId: 'root', title: '新手入门', now: 1 }));

    store.execute(documentCommands.createNode({
      type: 'createNode',
      parentId: 'root',
      node: { id: 'a', content: 'A' },
    }));
    store.execute(documentCommands.updateContent('a', 'A updated'));

    expect(store.getDocument().nodes.a.content).toBe('A updated');
    expect(store.undo()).toBe(true);
    expect(store.getDocument().nodes.a.content).toBe('A');
    expect(store.undo()).toBe(true);
    expect(store.getDocument().nodes.a).toBeUndefined();
    expect(store.redo()).toBe(true);
    expect(store.getDocument().nodes.a.content).toBe('A');
  });

  it('merges continuous text input into one history entry', () => {
    const store = createDocumentStore(createDocument({ id: 'doc', rootId: 'root', title: '新手入门', now: 1 }));
    store.execute(documentCommands.createNode({
      type: 'createNode',
      parentId: 'root',
      node: { id: 'a', content: '' },
    }), { timestamp: 10 });

    store.execute(documentCommands.updateContent('a', '新', { mergeKey: 'edit:a' }), { timestamp: 100 });
    store.execute(documentCommands.updateContent('a', '新手', { mergeKey: 'edit:a' }), { timestamp: 200 });
    store.execute(documentCommands.updateContent('a', '新手入门', { mergeKey: 'edit:a' }), { timestamp: 300 });

    expect(store.getSnapshot().history.undoStack).toHaveLength(2);
    expect(store.getDocument().nodes.a.content).toBe('新手入门');
    expect(store.undo()).toBe(true);
    expect(store.getDocument().nodes.a.content).toBe('');
  });

  it('marks dirty changes and supports markSaved', () => {
    const store = createDocumentStore(createDocument({ id: 'doc', rootId: 'root', title: '新手入门', now: 1 }));
    expect(store.getSnapshot().dirty).toBe(false);

    store.execute(documentCommands.updateContent('root', '新标题'));
    expect(store.getSnapshot().dirty).toBe(true);
    expect(store.getDocument().title).toBe('新标题');

    store.markSaved();
    expect(store.getSnapshot().dirty).toBe(false);
  });
});
