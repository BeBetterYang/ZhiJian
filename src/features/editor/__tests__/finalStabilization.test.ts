import { describe, expect, it } from 'vitest';
import {
  createDocument,
  createDocumentStore,
  documentCommands,
  reduceDocument,
  validateDocument,
  type ZhiJianDocument,
} from '../core';
import { serializeMarkdown, parseMarkdown } from '../markdown';
import { parsePersistedDocument, toPersistedDocument } from '../persistence';
import { createOutlineViewState } from '../outline/outlineViewState';

function createWideDocument(count: number): ZhiJianDocument {
  let document = createDocument({ id: `wide-${count}`, rootId: 'root', title: 'Wide', now: 1 });
  for (let index = 0; index < count; index += 1) {
    document = reduceDocument(document, documentCommands.createNode({
      type: 'createNode',
      parentId: 'root',
      node: { id: `node-${index}`, content: `Node ${index}` },
    }), { now: index + 2 });
  }
  return document;
}

function createDeepDocument(depth: number): ZhiJianDocument {
  let document = createDocument({ id: `deep-${depth}`, rootId: 'root', title: 'Deep', now: 1 });
  let parentId = 'root';
  for (let index = 0; index < depth; index += 1) {
    const nodeId = `deep-${index}`;
    document = reduceDocument(document, documentCommands.createNode({
      type: 'createNode',
      parentId,
      node: { id: nodeId, content: `Deep ${index}` },
    }), { now: index + 2 });
    parentId = nodeId;
  }
  return document;
}

describe('final architecture stabilization', () => {
  it('keeps document stable across 500 view state accesses', () => {
    const store = createDocumentStore(createWideDocument(100));
    const snapshot = store.getSnapshot();
    const document = store.getDocument();

    for (let index = 0; index < 500; index += 1) {
      createOutlineViewState(document);
    }

    expect(store.getSnapshot()).toBe(snapshot);
    expect(store.getSnapshot().document.nodes.root.children).toHaveLength(100);
    expect(store.getSnapshot().history.undoStack).toHaveLength(0);
  });

  it('handles 3000 nodes for edit, move, undo, redo, serialize, save and reload', () => {
    const startedAt = performance.now();
    const store = createDocumentStore(createWideDocument(3000));
    store.execute(documentCommands.updateContent('node-0', 'Edited 0'));
    store.execute(documentCommands.moveNode({ nodeId: 'node-2999', parentId: 'node-0', index: 0 }));
    expect(store.undo()).toBe(true);
    expect(store.redo()).toBe(true);

    const markdown = serializeMarkdown(store.getDocument());
    const reloadedFromMarkdown = parseMarkdown(markdown, { documentId: 'markdown', rootId: 'root', now: 1 });
    const persisted = toPersistedDocument(store.getDocument());
    const reloadedFromPersistence = parsePersistedDocument(persisted);
    const elapsedMs = performance.now() - startedAt;
    console.info(`3000-node final baseline: ${elapsedMs.toFixed(2)}ms`);

    expect(validateDocument(store.getDocument()).valid).toBe(true);
    expect(validateDocument(reloadedFromMarkdown).valid).toBe(true);
    expect(reloadedFromPersistence?.nodes.root.children.length).toBe(2999);
  }, 15_000);

  it('handles a 100-level linear tree', () => {
    const document = createDeepDocument(100);
    const markdown = serializeMarkdown(document);
    const reloaded = parseMarkdown(markdown, { documentId: 'deep-reloaded', rootId: 'root', now: 1 });

    expect(validateDocument(document).valid).toBe(true);
    expect(validateDocument(reloaded).valid).toBe(true);
    const viewState = createOutlineViewState(document);
    expect(viewState.expandedIds.size).toBeGreaterThan(0);
  });

  it('handles 1000 siblings', () => {
    const document = createWideDocument(1000);

    expect(validateDocument(document).valid).toBe(true);
    expect(document.nodes.root.children).toHaveLength(1000);
    const viewState = createOutlineViewState(document);
    expect(viewState.expandedIds.has('root')).toBe(true);
  });

  it('projects 1000 store mutations without feeding back into the store', () => {
    const store = createDocumentStore(createWideDocument(10));
    createOutlineViewState(store.getDocument());
    let commandCount = 0;
    const unsubscribe = store.subscribe(() => {
      commandCount += 1;
    });

    for (let index = 0; index < 1000; index += 1) {
      store.execute(documentCommands.updateContent(`node-${index % 10}`, `Mutation ${index}`, {
        mergeKey: `loop-${index}`,
      }));
      // View state access is pure read: Document is sole source, projection never writes back to Store
      createOutlineViewState(store.getDocument());
    }

    unsubscribe();
    expect(commandCount).toBe(1000);
    expect(validateDocument(store.getDocument()).valid).toBe(true);
  });

  it('preserves rich content through persistence reload', () => {
    let document = createDocument({ id: 'full', rootId: 'root', title: 'Full', now: 1 });
    document = reduceDocument(document, documentCommands.createNode({
      type: 'createNode',
      parentId: 'root',
      node: {
        id: 'rich',
        content: 'Rich **bold**',
        blockType: 'heading1',
        todo: { checked: true },
        description: 'Note',
        images: [{ id: 'img', url: 'https://example.com/a.png', alt: 'A' }],
        style: { color: '#165DFF', backgroundColor: '#E8F3FF' },
        clozes: [{ start: 0, end: 4 }],
      },
    }));
    // 表格是独立的 TableNode，作为兄弟节点持久化
    document = reduceDocument(document, documentCommands.insertSiblingTable('rich', 'rich-table', { rows: [['A', 'B'], ['1', '2']] }));

    const reloaded = parsePersistedDocument(toPersistedDocument(document));

    expect(reloaded).toEqual(document);
  });
});
