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
});
