import { describe, expect, it } from 'vitest';
import { createDocument, documentCommands, reduceDocument, type ZhiJianDocument } from '../../core';
import {
  cloneMindMapData,
  contentToMindMapText,
  documentToMindMapData,
  mindMapTextToContent,
} from '../mindMapAdapter';
import { diffMindMapChangeToCommands } from '../mindMapDiff';

function createFixtureDocument(title: string, children: Array<{ id: string; content: string }>): ZhiJianDocument {
  let document = createDocument({ id: 'doc', rootId: 'root', title, now: 1 });
  children.forEach((item, index) => {
    document = reduceDocument(document, documentCommands.createNode({
      type: 'createNode',
      parentId: 'root',
      node: { id: item.id, content: item.content },
    }), { now: index + 2 });
  });
  return document;
}

describe('contentToMindMapText (Document → SimpleMindMap)', () => {
  it('keeps plain text without richText', () => {
    expect(contentToMindMapText('测试')).toEqual({ text: '测试', richText: false });
    expect(contentToMindMapText('')).toEqual({ text: '', richText: false });
  });

  it('converts inline markdown to HTML and enables richText', () => {
    expect(contentToMindMapText('**粗体**')).toEqual({ text: '<strong>粗体</strong>', richText: true });
    expect(contentToMindMapText('*斜体*')).toEqual({ text: '<em>斜体</em>', richText: true });
    expect(contentToMindMapText('~~删除线~~')).toEqual({ text: '<s>删除线</s>', richText: true });
    expect(contentToMindMapText('<u>下划线</u>')).toEqual({ text: '<u>下划线</u>', richText: true });
    expect(contentToMindMapText('混合 **粗体** 与 *斜体*')).toEqual({
      text: '混合 <strong>粗体</strong> 与 <em>斜体</em>',
      richText: true,
    });
  });

  it('does not misinterpret plain multiplication as emphasis', () => {
    expect(contentToMindMapText('5*5=25')).toEqual({ text: '5*5=25', richText: false });
  });
});

describe('mindMapTextToContent (SimpleMindMap → Document)', () => {
  it('keeps plain text unchanged', () => {
    expect(mindMapTextToContent('测试')).toBe('测试');
  });

  it('normalizes paragraph-wrapped plain text', () => {
    expect(mindMapTextToContent('<p>测试</p>')).toBe('测试');
    expect(mindMapTextToContent('<p>测试</p>', false)).toBe('测试');
  });

  it('keeps rich text semantics', () => {
    expect(mindMapTextToContent('<p><strong>粗体</strong></p>')).toBe('**粗体**');
    expect(mindMapTextToContent('<p><em>斜体</em></p>')).toBe('*斜体*');
    expect(mindMapTextToContent('<u>下划线</u>')).toBe('<u>下划线</u>');
    expect(mindMapTextToContent('<s>删除线</s>')).toBe('~~删除线~~');
    expect(mindMapTextToContent('<p><strong>粗</strong><em>斜</em></p>')).toBe('**粗***斜*');
  });

  it('collapses a single layer of escaped markup', () => {
    expect(mindMapTextToContent('&lt;p&gt;测试&lt;/p&gt;')).toBe('测试');
    expect(mindMapTextToContent('<p>&lt;strong&gt;粗体&lt;/strong&gt;</p>')).toBe('**粗体**');
  });

  it('never grows entity depth on already-escaped input', () => {
    const once = mindMapTextToContent('&lt;p&gt;测试&lt;/p&gt;');
    const twice = mindMapTextToContent(once);
    expect(once).toBe('测试');
    expect(twice).toBe('测试');
  });
});

describe('rich text boundary round trip', () => {
  /**
   * 依据 simple-mind-map 源码模拟 RichText 插件行为：
   * - handleSetData (before_set_data)：richText=false 时 htmlEscape(text) + 置 richText=true + resetRichText=true
   * - createRichTextNode：resetRichText 且 checkIsRichText=false 时把文本包成 <p>...</p> 并写回节点
   * - 富文本节点（用户编辑后）最终内容以 <p> 包裹
   */
  function simulateSmmRichText(data: { text: string; richText: boolean }): { text: string; richText: boolean } {
    let { text, richText } = data;
    if (!richText) {
      text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      richText = true;
    }
    if (!/^<p>/.test(text)) text = `<p>${text}</p>`;
    return { text, richText };
  }

  it('is idempotent for plain text across 100 cycles', () => {
    let content = '测试';
    for (let i = 0; i < 100; i += 1) {
      const { text } = contentToMindMapText(content);
      content = mindMapTextToContent(text);
    }
    expect(content).toBe('测试');
  });

  it('is idempotent for rich text across 100 cycles', () => {
    const original = '**粗体**\n*斜体*\n<u>下划线</u>\n~~删除线~~';
    let content = original;
    for (let i = 0; i < 100; i += 1) {
      const { text } = contentToMindMapText(content);
      content = mindMapTextToContent(text);
    }
    expect(content).toBe(original);
  });

  it('does not grow HTML entities across cycles', () => {
    let content = '测试';
    for (let i = 0; i < 100; i += 1) {
      const { text } = contentToMindMapText(content);
      content = mindMapTextToContent(text);
    }
    expect(content).not.toContain('&amp;');
    expect(content).not.toContain('&lt;');
    expect(content).not.toContain('&gt;');
  });

  it('keeps the store clean even if SimpleMindMap re-wraps text on every setData', () => {
    let storeContent = '测试';
    for (let i = 0; i < 100; i += 1) {
      const sentToSmm = contentToMindMapText(storeContent);
      const smmData = simulateSmmRichText(sentToSmm);
      const readBack = mindMapTextToContent(smmData.text, smmData.richText);
      // diff 语义：语义相同则不写回，模拟 applyMindMapDataChange 的无命令分支
      if (readBack === storeContent) continue;
      storeContent = readBack;
    }
    expect(storeContent).toBe('测试');
  });

  it('keeps rich text semantics when SimpleMindMap wraps nodes on every setData', () => {
    const original = '**粗体**';
    let storeContent = original;
    for (let i = 0; i < 100; i += 1) {
      const sentToSmm = contentToMindMapText(storeContent);
      const smmData = simulateSmmRichText(sentToSmm);
      const readBack = mindMapTextToContent(smmData.text, smmData.richText);
      if (readBack === storeContent) continue;
      storeContent = readBack;
    }
    expect(storeContent).toBe(original);
  });
});

describe('fake diff prevention', () => {
  it('does not emit updateContent when SimpleMindMap wraps plain text in <p>', () => {
    const document = createFixtureDocument('测试', [{ id: 'a', content: '测试' }]);
    const previous = documentToMindMapData(document);
    const next = cloneMindMapData(previous);
    if (next.data) next.data.text = '<p>测试</p>';
    if (next.children?.[0]?.data) next.children[0].data.text = '<p>测试</p>';

    const { commands } = diffMindMapChangeToCommands(document, previous, next);
    expect(commands.filter((command) => command.type === 'updateContent')).toHaveLength(0);
  });

  it('does not emit updateContent when rich text round trips', () => {
    const document = createFixtureDocument('**粗体**', [{ id: 'a', content: '*斜体*' }]);
    const previous = documentToMindMapData(document);
    // previous 已是 SMM 视图：root text='<strong>粗体</strong>'
    expect(previous.data.text).toBe('<strong>粗体</strong>');
    const next = cloneMindMapData(previous);
    // SMM 渲染后可能包一层 <p>
    if (next.data) next.data.text = '<p><strong>粗体</strong></p>';
    if (next.children?.[0]?.data) next.children[0].data.text = '<p><em>斜体</em></p>';

    const { commands } = diffMindMapChangeToCommands(document, previous, next);
    expect(commands.filter((command) => command.type === 'updateContent')).toHaveLength(0);
  });
});

describe('root and child nodes share the same boundary', () => {
  it('applies the conversion to the root node too', () => {
    const document = createFixtureDocument('**根节点**', [{ id: 'a', content: '子节点' }]);
    const data = documentToMindMapData(document);

    expect(data.data.text).toBe('<strong>根节点</strong>');
    expect(data.data.richText).toBe(true);
    expect(data.children?.[0].data.text).toBe('子节点');
    expect(data.children?.[0].data.richText).toBe(false);
  });

  it('round trips root and children without content drift', () => {
    const document = createFixtureDocument('**根节点**', [{ id: 'a', content: '子节点' }]);
    const data = documentToMindMapData(document);
    for (let i = 0; i < 50; i += 1) {
      if (data.data) data.data.text = mindMapTextToContent(data.data.text, data.data.richText);
      if (data.children?.[0]?.data) data.children[0].data.text = mindMapTextToContent(data.children[0].data.text, data.children[0].data.richText);
      expect(data.data.text).toBe('**根节点**');
      expect(data.children?.[0].data.text).toBe('子节点');
    }
  });
});
