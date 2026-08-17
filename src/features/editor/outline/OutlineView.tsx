import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@arco-design/web-react';
import { IconHome } from '@arco-design/web-react/icon';
import { Outliner, type OutlineData } from 'react-outliner-neo';
import 'react-outliner-neo/style.css';
import { marked } from 'marked';
import {
  documentCommands,
  getNode,
  getPreviousVisibleNodeId,
  type DocumentStore,
  type NodeId,
  type ZhiJianDocument,
} from '../core';
import { useDocumentStore } from '../hooks/useDocumentStore';
import { diffOutlinerChangeToCommands, documentToOutlinerData, getOutlineBreadcrumb, getOutlineTitle } from './outlineAdapter';
import { createOutlineViewState } from './outlineViewState';
import type { MutableOutlineViewState } from './outlineTypes';

type Props = {
  store: DocumentStore;
};

function renderInlineMarkdown(text: string) {
  return marked.parseInline(text, { async: false }) as string;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function renderTable(rows: string[][]) {
  const body = rows.map((row) => (
    `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`
  )).join('');
  return `<table class="zj-outline-table"><tbody>${body}</tbody></table>`;
}

function renderNodeContent(document: ZhiJianDocument, text: string, item: { id: string }) {
  const node = document.nodes[item.id];
  if (!node) return renderInlineMarkdown(text);
  const classes = ['zj-outline-topic', `zj-outline-${node.blockType}`];
  if (node.todo?.checked) classes.push('is-done');
  const todo = node.todo?.enabled
    ? `<input class="zj-outline-todo" data-zj-outline-todo="${node.id}" type="checkbox"${node.todo.checked ? ' checked' : ''} />`
    : '';
  const note = node.note ? `<div class="zj-outline-note">${escapeHtml(node.note)}</div>` : '';
  const images = node.images?.length
    ? `<div class="zj-outline-images">${node.images.map((image) => `<img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt ?? '')}" />`).join('')}</div>`
    : '';
  const table = node.table ? renderTable(node.table.rows) : '';

  return `<span class="${classes.join(' ')}">${todo}<span class="zj-outline-content">${renderInlineMarkdown(text || '')}</span></span>${note}${images}${table}`;
}

function getEditableElement(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  const editable = target?.closest('[data-outline-item]') as HTMLElement | null;
  if (!editable?.dataset.itemId) return null;
  return editable;
}

function getCaretOffset(editable: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!editable.contains(range.startContainer)) return null;
  const prefix = range.cloneRange();
  prefix.selectNodeContents(editable);
  prefix.setEnd(range.startContainer, range.startOffset);
  return prefix.toString().length;
}

export default function OutlineView({ store }: Props) {
  const snapshot = useDocumentStore(store);
  const document = snapshot.document as ZhiJianDocument;
  const [viewState, setViewState] = useState<MutableOutlineViewState>(() => createOutlineViewState(document));
  const previousDataRef = useRef<OutlineData[]>([]);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const isComposingRef = useRef(false);

  const outlinerData = useMemo(() => documentToOutlinerData(document, viewState), [document, viewState]);
  const title = getOutlineTitle(document, viewState);
  const breadcrumb = getOutlineBreadcrumb(document, viewState.focusNodeId);

  useEffect(() => {
    previousDataRef.current = outlinerData;
  }, [outlinerData]);

  const runCommands = useCallback((commands: ReturnType<typeof diffOutlinerChangeToCommands>['commands']) => {
    store.executeTransaction(commands);
  }, [store]);

  const handleOutlinerChange = useCallback((nextData: OutlineData[]) => {
    const result = diffOutlinerChangeToCommands({
      document,
      previousData: previousDataRef.current,
      nextData,
      viewState,
    });
    setViewState(result.viewState);
    runCommands(result.commands);
  }, [document, runCommands, viewState]);

  const handleTitleInput = useCallback((event: React.FormEvent<HTMLHeadingElement>) => {
    const nextTitle = event.currentTarget.textContent || '未命名';
    if (nextTitle === getNode(document, document.rootId).content) return;
    store.execute(documentCommands.updateContent(document.rootId, nextTitle, { mergeKey: `outline-title:${document.rootId}` }));
  }, [document, store]);

  const focusNode = useCallback((nodeId: NodeId | null) => {
    setViewState((current) => ({ ...current, focusNodeId: nodeId }));
  }, []);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (!shell.contains(event.target as Node)) return;
      if (event.isComposing || isComposingRef.current) return;
      const command = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (command && key === 'z' && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        store.undo();
        return;
      }
      if (command && (key === 'y' || key === 'z' && event.shiftKey)) {
        event.preventDefault();
        event.stopPropagation();
        store.redo();
        return;
      }

      if (key !== 'backspace') return;
      const editable = getEditableElement(event);
      if (!editable) return;
      const nodeId = editable.dataset.itemId;
      if (!nodeId || nodeId === document.rootId) return;
      const text = editable.textContent ?? '';
      const caretOffset = getCaretOffset(editable);
      if (text.length === 0) {
        event.preventDefault();
        event.stopPropagation();
        store.execute(documentCommands.deleteNode(nodeId));
      } else if (caretOffset === 0 && getPreviousVisibleNodeId(document, nodeId)) {
        event.preventDefault();
        event.stopPropagation();
        store.execute(documentCommands.mergeNode(nodeId));
      }
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const todo = target?.closest('[data-zj-outline-todo]') as HTMLInputElement | null;
      if (todo?.dataset.zjOutlineTodo) {
        event.preventDefault();
        event.stopPropagation();
        store.execute(documentCommands.setTodoChecked(todo.dataset.zjOutlineTodo, !todo.checked));
        return;
      }
      if (target?.closest('.outline-item-dot')) {
        const item = target.closest('.outline-item-wrapper')?.querySelector('[data-item-id]') as HTMLElement | null;
        if (item?.dataset.itemId) {
          focusNode(item.dataset.itemId);
        }
      }
    };

    const handleCompositionStart = () => {
      isComposingRef.current = true;
    };

    const handleCompositionEnd = () => {
      isComposingRef.current = false;
    };

    window.addEventListener('keydown', onKeyDown, true);
    shell.addEventListener('click', onClick, true);
    shell.addEventListener('compositionstart', handleCompositionStart, true);
    shell.addEventListener('compositionend', handleCompositionEnd, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      shell.removeEventListener('click', onClick, true);
      shell.removeEventListener('compositionstart', handleCompositionStart, true);
      shell.removeEventListener('compositionend', handleCompositionEnd, true);
    };
  }, [document, focusNode, store]);

  return (
    <div className="outline-editor zj-outline-shell" ref={shellRef}>
      <main className="zj-outline-page">
        <nav className="zj-outline-breadcrumb" aria-label="大纲聚焦路径">
          {breadcrumb.map((item, index) => (
            <span className="zj-outline-breadcrumb-segment" key={`${item.id}-${index}`}>
              {index === 0 && <IconHome />}
              {index > 0 && <span className="zj-outline-breadcrumb-separator">/</span>}
              <Button type="text" size="mini" onClick={() => focusNode(index === 0 ? null : item.id)}>
                {item.content}
              </Button>
            </span>
          ))}
        </nav>
        <h1
          className="zj-outline-title"
          contentEditable
          suppressContentEditableWarning
          onInput={handleTitleInput}
        >
          {title}
        </h1>
        <Outliner
          key={viewState.focusNodeId ?? 'root'}
          data={outlinerData}
          onChange={handleOutlinerChange}
          markdown={(text, item) => renderNodeContent(document, text, item)}
          readonly={false}
          fileName={getNode(document, document.rootId).content}
          i18n={{
            menuTitle: '主题操作',
            outdent: '提升层级',
            indent: '降低层级',
            delete: '删除主题',
            zoomIn: '聚焦主题',
            untitled: '新主题',
            dragToMove: '拖动排序',
            zoomInAndDrag: '聚焦 / 拖动',
          }}
        />
      </main>
    </div>
  );
}
