import { describe, expect, it } from 'vitest';
import { createDocument, reduceDocument, documentCommands } from '../../core';
import { computeMindMapLayout } from '../mindMapLayout';

describe('mindMapLayout', () => {
  it('computes layout for single root node', () => {
    const document = createDocument({ id: 'test', rootId: 'root', title: 'Test', now: 1 });
    const layout = computeMindMapLayout(document);

    expect(layout).toHaveLength(1);
    expect(layout[0].id).toBe('root');
    expect(layout[0].x).toBe(0);
    expect(layout[0].y).toBe(0);
  });

  it('lays out root with children horizontally', () => {
    let document = createDocument({ id: 'test', rootId: 'root', title: 'Test', now: 1 });
    document = reduceDocument(document, documentCommands.createNode({
      type: 'createNode',
      parentId: 'root',
      node: { id: 'child1', content: 'Child 1' },
    }), { now: 2 });
    document = reduceDocument(document, documentCommands.createNode({
      type: 'createNode',
      parentId: 'root',
      node: { id: 'child2', content: 'Child 2' },
    }), { now: 3 });

    const layout = computeMindMapLayout(document);

    expect(layout).toHaveLength(3);
    const root = layout.find(n => n.id === 'root');
    const child1 = layout.find(n => n.id === 'child1');
    const child2 = layout.find(n => n.id === 'child2');

    expect(root?.x).toBe(0);
    expect(child1?.x).toBeGreaterThan(root!.x);
    expect(child2?.x).toBeGreaterThan(root!.x);
    expect(child1?.x).toBe(child2?.x); // Same depth, same x
  });

  it('centers root vertically among children', () => {
    let document = createDocument({ id: 'test', rootId: 'root', title: 'Test', now: 1 });
    document = reduceDocument(document, documentCommands.createNode({
      type: 'createNode',
      parentId: 'root',
      node: { id: 'child1', content: 'Child 1' },
    }), { now: 2 });
    document = reduceDocument(document, documentCommands.createNode({
      type: 'createNode',
      parentId: 'root',
      node: { id: 'child2', content: 'Child 2' },
    }), { now: 3 });

    const layout = computeMindMapLayout(document);

    const root = layout.find(n => n.id === 'root');
    const child1 = layout.find(n => n.id === 'child1');
    const child2 = layout.find(n => n.id === 'child2');

    // Root should be centered between children
    expect(root?.y).toBe((child1!.y + child2!.y) / 2);
  });

  it('handles nested tree with multiple depths', () => {
    let document = createDocument({ id: 'test', rootId: 'root', title: 'Test', now: 1 });
    document = reduceDocument(document, documentCommands.createNode({
      type: 'createNode',
      parentId: 'root',
      node: { id: 'child1', content: 'Child 1' },
    }), { now: 2 });
    document = reduceDocument(document, documentCommands.createNode({
      type: 'createNode',
      parentId: 'child1',
      node: { id: 'grandchild1', content: 'Grandchild 1' },
    }), { now: 3 });

    const layout = computeMindMapLayout(document);

    expect(layout).toHaveLength(3);
    const root = layout.find(n => n.id === 'root');
    const child1 = layout.find(n => n.id === 'child1');
    const grandchild1 = layout.find(n => n.id === 'grandchild1');

    expect(root?.x).toBe(0);
    expect(child1?.x).toBeGreaterThan(root!.x);
    expect(grandchild1?.x).toBeGreaterThan(child1!.x);
  });
});
