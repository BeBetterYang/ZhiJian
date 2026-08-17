import { describe, expect, it } from 'vitest';
import {
  createDocument,
  createDocumentStore,
  documentCommands,
  reduceDocument,
  validateDocument,
  type ZhiJianDocument,
} from '../index';

const orderedChildren = (document: ZhiJianDocument, nodeId = 'root') => document.nodes[nodeId].children;

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

function createOrderedDocument(): ZhiJianDocument {
  let document = createDocument({ id: 'doc', rootId: 'root', title: '新手入门', now: 1 });
  for (const id of ['a', 'b', 'c', 'd']) {
    document = reduceDocument(document, documentCommands.createNode({
      type: 'createNode',
      parentId: 'root',
      node: { id, content: id.toUpperCase() },
    }));
  }
  return document;
}

function createLargeDocument(count: number): ZhiJianDocument {
  let document = createDocument({ id: 'large-doc', rootId: 'root', title: '性能基准', now: 1 });
  for (let index = 0; index < count; index += 1) {
    document = reduceDocument(document, documentCommands.createNode({
      type: 'createNode',
      parentId: 'root',
      node: { id: `node-${index}`, content: `Node ${index}` },
    }), { validate: index % 100 === 99 });
  }
  return document;
}

describe('ZhiJian core document', () => {
  it('creates a normalized document with a stable root', () => {
    const document = createDocument({ id: 'doc', rootId: 'root', title: '新手入门', now: 100 });

    expect(document.rootId).toBe('root');
    expect(document.nodes.root.parentId).toBeNull();
    expect(document.nodes.root.content).toBe('新手入门');
    expect(document.nodes.root.blockType).toBe('root');
    expect(validateDocument(document).valid).toBe(true);
  });

  it('treats root as document root instead of a normal heading node', () => {
    const document = createDocument({ id: 'doc', rootId: 'root', title: '新手入门', now: 100 });

    expect(document.nodes.root.blockType).toBe('root');
    expect(() => reduceDocument(document, documentCommands.setBlockType('root', 'heading1')))
      .toThrow('Root node block type cannot be changed');
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

  it('uses final index semantics for same-parent reorder boundaries', () => {
    let document = createOrderedDocument();

    document = reduceDocument(document, documentCommands.moveNode({ nodeId: 'a', parentId: 'root', index: 4 }));
    expect(orderedChildren(document)).toEqual(['b', 'c', 'd', 'a']);

    document = createOrderedDocument();
    document = reduceDocument(document, documentCommands.moveNode({ nodeId: 'd', parentId: 'root', index: 0 }));
    expect(orderedChildren(document)).toEqual(['d', 'a', 'b', 'c']);

    document = createOrderedDocument();
    document = reduceDocument(document, documentCommands.moveNode({ nodeId: 'b', parentId: 'root', index: 2 }));
    expect(orderedChildren(document)).toEqual(['a', 'c', 'b', 'd']);

    document = createOrderedDocument();
    document = reduceDocument(document, documentCommands.moveNode({ nodeId: 'c', parentId: 'root', index: 1 }));
    expect(orderedChildren(document)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('clamps move indexes and supports cross-parent move boundaries', () => {
    let document = createOrderedDocument();

    document = reduceDocument(document, documentCommands.moveNode({ nodeId: 'b', parentId: 'a', index: 0 }));
    expect(orderedChildren(document, 'a')).toEqual(['b']);
    expect(document.nodes.b.parentId).toBe('a');

    document = reduceDocument(document, documentCommands.moveNode({ nodeId: 'c', parentId: 'a', index: 999 }));
    expect(orderedChildren(document, 'a')).toEqual(['b', 'c']);
    expect(document.nodes.c.parentId).toBe('a');

    document = reduceDocument(document, documentCommands.moveNode({ nodeId: 'd', parentId: 'a', index: -10 }));
    expect(orderedChildren(document, 'a')).toEqual(['d', 'b', 'c']);
    expect(document.nodes.d.parentId).toBe('a');
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

  it('protects root from destructive or structural commands', () => {
    const document = createFixtureDocument();

    expect(() => reduceDocument(document, documentCommands.deleteNode('root'))).toThrow('Root node cannot be deleted');
    expect(() => reduceDocument(document, documentCommands.moveNode({ nodeId: 'root', parentId: 'a', index: 0 })))
      .toThrow('Root node cannot be moved');
    expect(() => reduceDocument(document, documentCommands.indentNode('root'))).toThrow('Root node cannot be indented');
    expect(() => reduceDocument(document, documentCommands.outdentNode('root'))).toThrow('Root node cannot be outdented');
    expect(() => reduceDocument(document, documentCommands.splitNode('root', 1))).toThrow('Root node content cannot be split');
    expect(() => reduceDocument(document, documentCommands.mergeNode('root'))).toThrow('Root node cannot be merged');
    expect(() => reduceDocument(document, documentCommands.setBlockType('root', 'heading1')))
      .toThrow('Root node block type cannot be changed');
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

  it('separates duplicate child and multiple parent validation errors', () => {
    const document = createFixtureDocument();
    const duplicateChild: ZhiJianDocument = {
      ...document,
      nodes: {
        ...document.nodes,
        root: {
          ...document.nodes.root,
          children: ['a', 'a', 'b'],
        },
      },
    };

    const duplicateResult = validateDocument(duplicateChild);
    expect(duplicateResult.valid).toBe(false);
    expect(duplicateResult.issues.some((issue) => issue.code === 'DUPLICATE_CHILD')).toBe(true);
    expect(duplicateResult.issues.some((issue) => issue.code === 'MULTIPLE_PARENTS')).toBe(false);

    const multipleParents: ZhiJianDocument = {
      ...document,
      nodes: {
        ...document.nodes,
        root: {
          ...document.nodes.root,
          children: ['a', 'b', 'a1'],
        },
      },
    };

    const multipleParentResult = validateDocument(multipleParents);
    expect(multipleParentResult.valid).toBe(false);
    expect(multipleParentResult.issues.some((issue) => issue.code === 'MULTIPLE_PARENTS')).toBe(true);
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

  it('caps undo history to maxEntries while preserving recent undo operations', () => {
    const store = createDocumentStore(createDocument({ id: 'doc', rootId: 'root', title: '新手入门', now: 1 }));
    store.execute(documentCommands.createNode({
      type: 'createNode',
      parentId: 'root',
      node: { id: 'a', content: '0' },
    }), { timestamp: 1 });

    for (let index = 1; index <= 120; index += 1) {
      store.execute(documentCommands.updateContent('a', String(index)), { timestamp: 1_000 + index, mergeKey: `edit:${index}` });
    }

    expect(store.getSnapshot().history.undoStack).toHaveLength(100);
    expect(store.getDocument().nodes.a.content).toBe('120');

    for (let index = 0; index < 100; index += 1) {
      expect(store.undo()).toBe(true);
    }

    expect(store.getDocument().nodes.a.content).toBe('20');
    expect(store.undo()).toBe(false);
  });

  it('keeps maxEntries when continuous text input is merged', () => {
    const store = createDocumentStore(createDocument({ id: 'doc', rootId: 'root', title: '新手入门', now: 1 }));
    store.execute(documentCommands.createNode({
      type: 'createNode',
      parentId: 'root',
      node: { id: 'a', content: '' },
    }), { timestamp: 1 });

    for (let index = 1; index <= 150; index += 1) {
      store.execute(documentCommands.updateContent('a', String(index), { mergeKey: 'edit:a' }), { timestamp: index });
    }

    expect(store.getSnapshot().history.undoStack.length).toBeLessThanOrEqual(100);
    expect(store.getSnapshot().history.undoStack).toHaveLength(2);
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

  it('does not clear existing history when recordHistory is false', () => {
    const store = createDocumentStore(createDocument({ id: 'doc', rootId: 'root', title: '新手入门', now: 1 }));

    store.execute(documentCommands.createNode({
      type: 'createNode',
      parentId: 'root',
      node: { id: 'a', content: 'A' },
    }));
    store.execute(documentCommands.updateContent('a', 'A updated'));
    const undoLengthBeforeSilentMutation = store.getSnapshot().history.undoStack.length;

    store.execute(documentCommands.createNode({
      type: 'createNode',
      parentId: 'root',
      node: { id: 'b', content: 'B' },
    }), { recordHistory: false });

    expect(store.getSnapshot().history.undoStack).toHaveLength(undoLengthBeforeSilentMutation);
    expect(store.getDocument().nodes.b.content).toBe('B');
    expect(store.undo()).toBe(true);
    expect(store.getDocument().nodes.a.content).toBe('A');
  });

  it('resets history explicitly without changing document or dirty state', () => {
    const store = createDocumentStore(createDocument({ id: 'doc', rootId: 'root', title: '新手入门', now: 1 }));
    store.execute(documentCommands.createNode({
      type: 'createNode',
      parentId: 'root',
      node: { id: 'a', content: 'A' },
    }));
    const documentBeforeReset = store.getDocument();
    const dirtyBeforeReset = store.getSnapshot().dirty;

    store.resetHistory();

    expect(store.getSnapshot().history.undoStack).toHaveLength(0);
    expect(store.getSnapshot().history.redoStack).toHaveLength(0);
    expect(store.getDocument()).toEqual(documentBeforeReset);
    expect(store.getSnapshot().dirty).toBe(dirtyBeforeReset);
    expect(store.undo()).toBe(false);
  });

  it('keeps getSnapshot reference stable until store state changes', () => {
    const store = createDocumentStore(createDocument({ id: 'doc', rootId: 'root', title: '新手入门', now: 1 }));
    const snapshot1 = store.getSnapshot();
    const snapshot2 = store.getSnapshot();
    let emitCount = 0;
    const unsubscribe = store.subscribe(() => {
      emitCount += 1;
    });

    expect(snapshot1).toBe(snapshot2);
    store.markSaved();
    expect(emitCount).toBe(0);
    expect(store.getSnapshot()).toBe(snapshot1);

    store.execute(documentCommands.updateContent('root', '新标题'));
    const snapshot3 = store.getSnapshot();
    expect(snapshot3).not.toBe(snapshot1);
    expect(snapshot3).toBe(store.getSnapshot());
    expect(emitCount).toBe(1);

    unsubscribe();
  });
});

describe('ZhiJian core large tree benchmark', () => {
  it('handles 1000 nodes with updates, moves, undo, redo and validation', () => {
    const startedAt = performance.now();
    const store = createDocumentStore(createLargeDocument(1000));

    for (let index = 0; index < 100; index += 1) {
      store.execute(documentCommands.updateContent(`node-${index}`, `Updated ${index}`), {
        timestamp: 10_000 + index,
        mergeKey: `bulk-edit-${index}`,
      });
    }

    for (let index = 0; index < 50; index += 1) {
      store.execute(documentCommands.moveNode({
        nodeId: `node-${index}`,
        parentId: 'root',
        index: 1000 - index,
      }), { timestamp: 20_000 + index });
    }

    for (let index = 0; index < 50; index += 1) {
      expect(store.undo()).toBe(true);
    }

    for (let index = 0; index < 50; index += 1) {
      expect(store.redo()).toBe(true);
    }

    const result = validateDocument(store.getDocument());
    const elapsedMs = performance.now() - startedAt;
    console.info(`1000-node core benchmark: ${elapsedMs.toFixed(2)}ms`);

    expect(result.valid).toBe(true);
    expect(store.getDocument().nodes['node-0'].content).toBe('Updated 0');
  });
});
