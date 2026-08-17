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
import {
  diffOutlinerChangeToCommands,
  documentToOutlinerData,
  getOutlineBreadcrumb,
} from '../outlineAdapter';
import { createOutlineViewState } from '../outlineViewState';
import type { MutableOutlineViewState } from '../outlineTypes';

function createOutlineFixture(): { document: ZhiJianDocument; viewState: MutableOutlineViewState } {
  let document = createDocument({ id: 'doc', rootId: 'root', title: '新手入门', now: 1 });
  document = reduceDocument(document, documentCommands.createNode({
    type: 'createNode',
    parentId: 'root',
    node: { id: 'a', content: 'A', blockType: 'heading1', note: 'Note A' },
  }));
  document = reduceDocument(document, documentCommands.createNode({
    type: 'createNode',
    parentId: 'root',
    node: { id: 'b', content: 'B', todo: { enabled: true, checked: false } },
  }));
  document = reduceDocument(document, documentCommands.createNode({
    type: 'createNode',
    parentId: 'root',
    node: { id: 'c', content: 'C' },
  }));
  document = reduceDocument(document, documentCommands.createNode({
    type: 'createNode',
    parentId: 'a',
    node: { id: 'a1', content: 'A1' },
  }));
  return { document, viewState: createOutlineViewState(document) };
}

function applyCommands(document: ZhiJianDocument, commands: DocumentCommand[]) {
  return commands.reduce((current, command) => reduceDocument(current, command), document);
}

describe('outline adapter', () => {
  it('converts root children to outliner data without rendering root as a bullet', () => {
    const { document, viewState } = createOutlineFixture();
    const data = documentToOutlinerData(document, viewState);

    expect(data.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(data.some((item) => item.id === document.rootId)).toBe(false);
    expect(data[0].children?.[0].id).toBe('a1');
  });

  it('uses direct node IDs and never path/index IDs', () => {
    const { document, viewState } = createOutlineFixture();
    const ids = JSON.stringify(documentToOutlinerData(document, viewState));

    expect(ids).toContain('"id":"a"');
    expect(ids).toContain('"id":"a1"');
    expect(ids).not.toContain('path');
    expect(ids).not.toContain('_outlineId');
  });

  it('diffs content updates into updateContent commands', () => {
    const { document, viewState } = createOutlineFixture();
    const previousData = documentToOutlinerData(document, viewState);
    const nextData = previousData.map((item) => item.id === 'b' ? { ...item, topic: 'B updated' } : item);
    const result = diffOutlinerChangeToCommands({ document, previousData, nextData, viewState });

    expect(result.usedWholeTreeReplace).toBe(false);
    expect(result.commands).toEqual([documentCommands.updateContent('b', 'B updated', { mergeKey: 'outline-content:b' })]);
  });

  it('diffs created outliner nodes into createNode with a new permanent core ID', () => {
    const { document, viewState } = createOutlineFixture();
    const previousData = documentToOutlinerData(document, viewState);
    const nextData = [
      ...previousData,
      { id: 'outliner-random-id', topic: 'New', children: [] },
    ];
    const result = diffOutlinerChangeToCommands({ document, previousData, nextData, viewState });
    const command = result.commands[0];

    expect(command.type).toBe('createNode');
    if (command.type !== 'createNode') return;
    expect(command.parentId).toBe('root');
    expect(command.index).toBe(3);
    expect(command.node?.id).toBe(result.idReplacements.get('outliner-random-id'));
    expect(command.node?.id).not.toBe('outliner-random-id');
    expect(command.node?.id).not.toContain('path');
  });

  it('diffs deletion into deleteNode commands without deleting children twice', () => {
    const { document, viewState } = createOutlineFixture();
    const previousData = documentToOutlinerData(document, viewState);
    const nextData = previousData.filter((item) => item.id !== 'a');
    const result = diffOutlinerChangeToCommands({ document, previousData, nextData, viewState });

    expect(result.commands).toEqual([documentCommands.deleteNode('a')]);
  });

  it('diffs indent/outdent/reorder/drag shape changes into moveNode', () => {
    const { document, viewState } = createOutlineFixture();
    const previousData = documentToOutlinerData(document, viewState);
    const nextData = [
      { ...previousData[0], children: [...(previousData[0].children ?? []), previousData[1]] },
      previousData[2],
    ];
    const result = diffOutlinerChangeToCommands({ document, previousData, nextData, viewState });

    expect(result.commands).toContainEqual(documentCommands.moveNode({ nodeId: 'b', parentId: 'a', index: 1 }));
    const nextDocument = applyCommands(document, result.commands);
    expect(nextDocument.nodes.b.parentId).toBe('a');
    expect(nextDocument.nodes.a.children).toEqual(['a1', 'b']);
    expect(validateDocument(nextDocument).valid).toBe(true);
  });

  it('keeps collapse in Outline View State and not in ZhiJianDocument', () => {
    const { document, viewState } = createOutlineFixture();
    const previousData = documentToOutlinerData(document, viewState);
    const nextData = previousData.map((item) => item.id === 'a' ? { ...item, expanded: false } : item);
    const result = diffOutlinerChangeToCommands({ document, previousData, nextData, viewState });

    expect(result.commands).toHaveLength(0);
    expect(result.viewState.expandedIds.has('a')).toBe(false);
    expect(document.nodes.a).not.toHaveProperty('expanded');
  });

  it('infers Enter in the middle as splitNode instead of whole-tree replacement', () => {
    let document = createDocument({ id: 'doc', rootId: 'root', title: '新手入门', now: 1 });
    document = reduceDocument(document, documentCommands.createNode({
      type: 'createNode',
      parentId: 'root',
      node: { id: 'a', content: 'HelloWorld' },
    }));
    const viewState = createOutlineViewState(document);
    const previousData = documentToOutlinerData(document, viewState);
    const nextData = [
      { id: 'a', topic: 'Hello', children: [] },
      { id: 'outliner-new', topic: 'World', children: [] },
    ];
    const result = diffOutlinerChangeToCommands({ document, previousData, nextData, viewState });

    expect(result.usedWholeTreeReplace).toBe(false);
    expect(result.commands[0].type).toBe('splitNode');
    if (result.commands[0].type !== 'splitNode') return;
    expect(result.commands[0].nodeId).toBe('a');
    expect(result.commands[0].offset).toBe(5);
    expect(result.commands[0].newNodeId).toBe(result.idReplacements.get('outliner-new'));
  });

  it('builds breadcrumb from the core tree, not from outliner state', () => {
    const { document } = createOutlineFixture();

    expect(getOutlineBreadcrumb(document, 'a1').map((item) => item.content)).toEqual(['新手入门', 'A', 'A1']);
  });

  it('preserves headings and attachments as node metadata instead of outline children', () => {
    const { document, viewState } = createOutlineFixture();
    const data = documentToOutlinerData(document, viewState);

    expect(data[0].topic).toBe('A');
    expect(data[0].children?.map((item) => item.id)).toEqual(['a1']);
    expect(document.nodes.a.blockType).toBe('heading1');
    expect(document.nodes.a.note).toBe('Note A');
  });

  it('uses the global DocumentStore history for todo commands', () => {
    const { document } = createOutlineFixture();
    const store = createDocumentStore(document);

    store.execute(documentCommands.setTodoChecked('b', true));
    expect(store.getDocument().nodes.b.todo?.checked).toBe(true);
    expect(store.undo()).toBe(true);
    expect(store.getDocument().nodes.b.todo?.checked).toBe(false);
    expect(store.redo()).toBe(true);
    expect(store.getDocument().nodes.b.todo?.checked).toBe(true);
  });

  it('keeps IME composition events out of structural command diff', () => {
    const { document, viewState } = createOutlineFixture();
    const previousData = documentToOutlinerData(document, viewState);
    const nextData = previousData.map((item) => item.id === 'a' ? { ...item, topic: '产品规划' } : item);
    const result = diffOutlinerChangeToCommands({ document, previousData, nextData, viewState });

    expect(result.commands).toEqual([
      documentCommands.updateContent('a', '产品规划', { mergeKey: 'outline-content:a' }),
    ]);
    expect(result.commands.some((command) => ['createNode', 'deleteNode', 'moveNode', 'splitNode', 'mergeNode', 'indentNode', 'outdentNode'].includes(command.type))).toBe(false);
  });

  it('supports Enter at end as createNode and undo restores the previous tree', () => {
    const { document, viewState } = createOutlineFixture();
    const store = createDocumentStore(document);
    const previousData = documentToOutlinerData(store.getDocument(), viewState);
    const nextData = [
      previousData[0],
      { id: 'new-outliner-node', topic: '', children: [] },
      previousData[1],
      previousData[2],
    ];
    const result = diffOutlinerChangeToCommands({ document: store.getDocument(), previousData, nextData, viewState });
    store.executeTransaction(result.commands);
    const createdId = result.idReplacements.get('new-outliner-node');

    expect(createdId).toBeTruthy();
    expect(store.getDocument().nodes.root.children).toEqual(['a', createdId, 'b', 'c']);
    expect(store.undo()).toBe(true);
    expect(store.getDocument().nodes.root.children).toEqual(['a', 'b', 'c']);
  });

  it('supports split and undo using stable original node ID plus new UUID', () => {
    let document = createDocument({ id: 'doc', rootId: 'root', title: '新手入门', now: 1 });
    document = reduceDocument(document, documentCommands.createNode({
      type: 'createNode',
      parentId: 'root',
      node: { id: 'hello', content: 'Hello' },
    }));
    const store = createDocumentStore(document);
    const viewState = createOutlineViewState(document);
    const previousData = documentToOutlinerData(document, viewState);
    const nextData = [
      { id: 'hello', topic: 'Hel', children: [] },
      { id: 'outliner-split', topic: 'lo', children: [] },
    ];
    const result = diffOutlinerChangeToCommands({ document, previousData, nextData, viewState });
    store.executeTransaction(result.commands);
    const newNodeId = result.idReplacements.get('outliner-split');

    expect(store.getDocument().nodes.hello.content).toBe('Hel');
    expect(store.getDocument().nodes.hello.id).toBe('hello');
    expect(newNodeId).toBeTruthy();
    expect(store.getDocument().nodes[newNodeId ?? '']?.content).toBe('lo');
    expect(store.undo()).toBe(true);
    expect(store.getDocument().nodes.hello.content).toBe('Hello');
    expect(store.getDocument().nodes[newNodeId ?? '']).toBeUndefined();
  });

  it('supports Backspace merge and undo restoring two nodes', () => {
    let document = createDocument({ id: 'doc', rootId: 'root', title: '新手入门', now: 1 });
    document = reduceDocument(document, documentCommands.createNode({
      type: 'createNode',
      parentId: 'root',
      node: { id: 'hello', content: 'Hello' },
    }));
    document = reduceDocument(document, documentCommands.createNode({
      type: 'createNode',
      parentId: 'root',
      node: { id: 'world', content: 'World' },
    }));
    const store = createDocumentStore(document);

    store.execute(documentCommands.mergeNode('world'));
    expect(store.getDocument().nodes.hello.content).toBe('HelloWorld');
    expect(store.getDocument().nodes.world).toBeUndefined();
    expect(validateDocument(store.getDocument()).valid).toBe(true);
    expect(store.undo()).toBe(true);
    expect(store.getDocument().nodes.hello.content).toBe('Hello');
    expect(store.getDocument().nodes.world.content).toBe('World');
  });

  it('keeps tree valid through repeated Tab and Shift+Tab command cycles', () => {
    let document = createDocument({ id: 'doc', rootId: 'root', title: '新手入门', now: 1 });
    document = reduceDocument(document, documentCommands.createNode({
      type: 'createNode',
      parentId: 'root',
      node: { id: 'a', content: 'A' },
    }));
    document = reduceDocument(document, documentCommands.createNode({
      type: 'createNode',
      parentId: 'root',
      node: { id: 'b', content: 'B' },
    }));
    const store = createDocumentStore(document);

    for (let index = 0; index < 30; index += 1) {
      store.execute(documentCommands.indentNode('b'));
      expect(validateDocument(store.getDocument()).valid).toBe(true);
      store.execute(documentCommands.outdentNode('b'));
      expect(validateDocument(store.getDocument()).valid).toBe(true);
    }

    expect(store.getDocument().nodes.root.children).toEqual(['a', 'b']);
  });

  it('keeps node IDs stable through repeated drag-style moveNode commands', () => {
    let document = createDocument({ id: 'doc', rootId: 'root', title: '新手入门', now: 1 });
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      document = reduceDocument(document, documentCommands.createNode({
        type: 'createNode',
        parentId: 'root',
        node: { id, content: id.toUpperCase() },
      }));
    }
    const store = createDocumentStore(document);
    const idsBefore = Object.keys(store.getDocument().nodes).sort();

    for (let index = 0; index < 50; index += 1) {
      const nodeId = ['a', 'b', 'c', 'd', 'e'][index % 5];
      const parentId = index % 3 === 0 && nodeId !== 'a' ? 'a' : 'root';
      const targetParent = store.getDocument().nodes[parentId];
      const safeParentId = targetParent.children.includes(nodeId) || nodeId === parentId ? 'root' : parentId;
      store.execute(documentCommands.moveNode({
        nodeId,
        parentId: safeParentId,
        index: index,
      }));
      expect(validateDocument(store.getDocument()).valid).toBe(true);
    }

    expect(Object.keys(store.getDocument().nodes).sort()).toEqual(idsBefore);
  });

  it('keeps tree legal through create edit split indent drag delete undo redo flow', () => {
    const store = createDocumentStore(createDocument({ id: 'doc', rootId: 'root', title: '新手入门', now: 1 }));
    store.execute(documentCommands.createNode({
      type: 'createNode',
      parentId: 'root',
      node: { id: 'a', content: 'Hello' },
    }));
    store.execute(documentCommands.updateContent('a', 'HelloWorld'));
    store.execute(documentCommands.splitNode('a', 5, 'b'));
    store.execute(documentCommands.indentNode('b'));
    store.execute(documentCommands.moveNode({ nodeId: 'b', parentId: 'root', index: 0 }));
    store.execute(documentCommands.deleteNode('b'));

    for (let index = 0; index < 6; index += 1) {
      expect(store.undo()).toBe(true);
      expect(validateDocument(store.getDocument()).valid).toBe(true);
    }

    for (let index = 0; index < 6; index += 1) {
      expect(store.redo()).toBe(true);
      expect(validateDocument(store.getDocument()).valid).toBe(true);
    }
  });
});
