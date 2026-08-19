import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NodeContentEditor } from '../NodeContentEditor';
import type { ContentNode } from '../../core';

describe('NodeContentEditor - Rich Content Rendering', () => {
  const createContentNode = (content: string, overrides = {}): ContentNode => ({
    id: 'test-node',
    kind: 'content',
    content,
    blockType: 'text',
    parentId: null,
    children: [],
    ...overrides,
  });

  it('renders bold markdown with **text**', () => {
    const node = createContentNode('This is **bold** text');
    render(
      <NodeContentEditor
        node={node}
        focused={false}
        onContentChange={() => {}}
        onDescriptionChange={() => {}}
        onEnter={() => {}}
        onShiftEnter={() => {}}
        onBackspaceAtContentStart={() => {}}
        onBackspaceAtDescriptionStart={() => {}}
        onTab={() => {}}
        onShiftTab={() => {}}
      />
    );

    const strong = screen.getByText('bold');
    expect(strong.tagName).toBe('STRONG');
  });

  it('renders italic markdown with *text*', () => {
    const node = createContentNode('This is *italic* text');
    render(
      <NodeContentEditor
        node={node}
        focused={false}
        onContentChange={() => {}}
        onDescriptionChange={() => {}}
        onEnter={() => {}}
        onShiftEnter={() => {}}
        onBackspaceAtContentStart={() => {}}
        onBackspaceAtDescriptionStart={() => {}}
        onTab={() => {}}
        onShiftTab={() => {}}
      />
    );

    const em = screen.getByText('italic');
    expect(em.tagName).toBe('EM');
  });

  it('renders inline code with `text`', () => {
    const node = createContentNode('Use `console.log()` for debugging');
    render(
      <NodeContentEditor
        node={node}
        focused={false}
        onContentChange={() => {}}
        onDescriptionChange={() => {}}
        onEnter={() => {}}
        onShiftEnter={() => {}}
        onBackspaceAtContentStart={() => {}}
        onBackspaceAtDescriptionStart={() => {}}
        onTab={() => {}}
        onShiftTab={() => {}}
      />
    );

    const code = screen.getByText('console.log()');
    expect(code.tagName).toBe('CODE');
    expect(code.className).toBe('zj-inline-code');
  });

  it('renders links with [text](url)', () => {
    const node = createContentNode('Visit [Google](https://google.com) now');
    render(
      <NodeContentEditor
        node={node}
        focused={false}
        onContentChange={() => {}}
        onDescriptionChange={() => {}}
        onEnter={() => {}}
        onShiftEnter={() => {}}
        onBackspaceAtContentStart={() => {}}
        onBackspaceAtDescriptionStart={() => {}}
        onTab={() => {}}
        onShiftTab={() => {}}
      />
    );

    const link = screen.getByText('Google');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('https://google.com');
    expect(link.className).toBe('zj-inline-link');
  });

  it('sanitizes javascript: URLs in links', () => {
    const node = createContentNode('Bad [link](javascript:alert(1))');
    render(
      <NodeContentEditor
        node={node}
        focused={false}
        onContentChange={() => {}}
        onDescriptionChange={() => {}}
        onEnter={() => {}}
        onShiftEnter={() => {}}
        onBackspaceAtContentStart={() => {}}
        onBackspaceAtDescriptionStart={() => {}}
        onTab={() => {}}
        onShiftTab={() => {}}
      />
    );

    const link = screen.getByText('link');
    expect(link.getAttribute('href')).toBe('#');
  });

  it('renders mixed markdown styles', () => {
    const node = createContentNode('**Bold** and *italic* with `code` and [link](https://example.com)');
    const { container } = render(
      <NodeContentEditor
        node={node}
        focused={false}
        onContentChange={() => {}}
        onDescriptionChange={() => {}}
        onEnter={() => {}}
        onShiftEnter={() => {}}
        onBackspaceAtContentStart={() => {}}
        onBackspaceAtDescriptionStart={() => {}}
        onTab={() => {}}
        onShiftTab={() => {}}
      />
    );

    expect(container.querySelector('strong')).toBeTruthy();
    expect(container.querySelector('em')).toBeTruthy();
    expect(container.querySelector('code')).toBeTruthy();
    expect(container.querySelector('a')).toBeTruthy();
  });
});
