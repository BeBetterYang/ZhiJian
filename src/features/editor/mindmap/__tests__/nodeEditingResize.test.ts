import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type MindMap from 'simple-mind-map';
import { createEditingNodeResizer } from '../nodeEditingResize';

function createMockNode() {
  return {
    _textData: null as unknown,
    width: 100,
    height: 30,
    createTextNode: vi.fn((text: string) => ({ text })),
    // Grow proportionally to text length so the assertion is meaningful.
    getNodeRect: vi.fn(function (this: { _textData: { text: string } }) {
      const len = this._textData?.text.length ?? 0;
      return { width: 40 + len * 8, height: len > 10 ? 60 : 30 };
    }),
    layout: vi.fn(),
    update: vi.fn(),
  };
}

function createMockInstance() {
  const updateTextEditNode = vi.fn();
  const render = vi.fn();
  const instance = {
    render,
    renderer: { textEdit: { updateTextEditNode } },
  };
  return { instance: instance as unknown as MindMap, render, updateTextEditNode };
}

describe('createEditingNodeResizer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('regrows only the edited node from the live text without a full-tree render', () => {
    const { instance, render, updateTextEditNode } = createMockInstance();
    const node = createMockNode();
    const resize = createEditingNodeResizer(instance, 100);

    resize({ node: node as never, text: 'hello world!!' });
    vi.advanceTimersByTime(100);

    expect(node.createTextNode).toHaveBeenCalledWith('hello world!!');
    // getNodeRect ran after _textData was set → new geometry applied to the node.
    expect(node.width).toBe(40 + 'hello world!!'.length * 8);
    expect(node.height).toBe(60);
    expect(node.layout).toHaveBeenCalledTimes(1);
    expect(node.update).toHaveBeenCalledTimes(1);
    expect(updateTextEditNode).toHaveBeenCalledTimes(1);
    // The whole point: no full-tree layout while typing.
    expect(render).not.toHaveBeenCalled();
  });

  it('debounces bursts of changes into a single resize', () => {
    const { instance, updateTextEditNode } = createMockInstance();
    const node = createMockNode();
    const resize = createEditingNodeResizer(instance, 100);

    resize({ node: node as never, text: 'a' });
    resize({ node: node as never, text: 'ab' });
    resize({ node: node as never, text: 'abc' });
    vi.advanceTimersByTime(100);

    expect(node.layout).toHaveBeenCalledTimes(1);
    expect(node.createTextNode).toHaveBeenCalledExactlyOnceWith('abc');
    expect(updateTextEditNode).toHaveBeenCalledTimes(1);
  });

  it('ignores changes without a node or text', () => {
    const { instance, updateTextEditNode } = createMockInstance();
    const resize = createEditingNodeResizer(instance, 100);

    resize({ node: undefined, text: 'x' });
    resize({ node: createMockNode() as never, text: undefined });
    vi.advanceTimersByTime(100);

    expect(updateTextEditNode).not.toHaveBeenCalled();
  });

  it('cancel() drops a pending resize', () => {
    const { instance, updateTextEditNode } = createMockInstance();
    const node = createMockNode();
    const resize = createEditingNodeResizer(instance, 100);

    resize({ node: node as never, text: 'hi' });
    resize.cancel();
    vi.advanceTimersByTime(100);

    expect(node.layout).not.toHaveBeenCalled();
    expect(updateTextEditNode).not.toHaveBeenCalled();
  });

  it('swallows errors from a torn-down node', () => {
    const { instance } = createMockInstance();
    const node = createMockNode();
    node.createTextNode.mockImplementation(() => {
      throw new Error('node destroyed');
    });
    const resize = createEditingNodeResizer(instance, 100);

    resize({ node: node as never, text: 'boom' });
    expect(() => vi.advanceTimersByTime(100)).not.toThrow();
  });
});
