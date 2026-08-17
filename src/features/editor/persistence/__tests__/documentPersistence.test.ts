import { describe, expect, it } from 'vitest';
import {
  createDocument,
  createDocumentStore,
  documentCommands,
} from '../../core';
import {
  parsePersistedDocument,
  toPersistedDocument,
} from '../documentPersistence';

describe('document persistence', () => {
  it('serializes only ZhiJianDocument with schemaVersion 1', () => {
    const document = createDocument({ id: 'doc', rootId: 'root', title: 'Root', now: 1 });
    const persisted = toPersistedDocument(document);

    expect(persisted.schemaVersion).toBe(1);
    expect(persisted.document.schemaVersion).toBe(1);
    expect(persisted.document.nodes.root.content).toBe('Root');
  });

  it('validates loaded persisted documents', () => {
    const document = createDocument({ id: 'doc', rootId: 'root', title: 'Root', now: 1 });

    expect(parsePersistedDocument(toPersistedDocument(document))).toEqual(document);
    expect(parsePersistedDocument({ schemaVersion: 1, document: { ...document, rootId: 'missing' } })).toBeNull();
  });

  it('replaceDocument can load/import a document and reset history without dirty state', () => {
    const store = createDocumentStore(createDocument({ id: 'doc', rootId: 'root', title: 'Old', now: 1 }));
    store.execute(documentCommands.updateContent('root', 'Dirty'));
    const incoming = createDocument({ id: 'doc', rootId: 'root2', title: 'Loaded', now: 2 });

    store.replaceDocument(incoming, { resetHistory: true, dirty: false, recordHistory: false });

    expect(store.getSnapshot().document.rootId).toBe('root2');
    expect(store.getSnapshot().document.nodes.root2.content).toBe('Loaded');
    expect(store.getSnapshot().dirty).toBe(false);
    expect(store.getSnapshot().history.undoStack).toHaveLength(0);
  });
});
