import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@arco-design/web-react';
import { IconHome } from '@arco-design/web-react/icon';
import {
  documentCommands,
  getNode,
  getNodeContent,
  type DocumentStore,
  type NodeId,
  type ZhiJianDocument,
} from '../core';
import { useDocumentStore } from '../hooks/useDocumentStore';
import { createOutlineViewState } from './outlineViewState';
import type { MutableOutlineViewState } from './outlineTypes';
import OutlineTreeView from './OutlineTreeView';

type Props = {
  store: DocumentStore;
};

function getOutlineBreadcrumb(document: ZhiJianDocument, focusNodeId: NodeId | null) {
  const path: Array<{ id: NodeId; content: string }> = [];
  let current = focusNodeId ? document.nodes[focusNodeId] : null;
  while (current) {
    path.unshift({ id: current.id, content: getNodeContent(current) || '未命名' });
    current = current.parentId ? document.nodes[current.parentId] : null;
  }
  const rootNode = getNode(document, document.rootId);
  return [
    { id: document.rootId, content: getNodeContent(rootNode) || '未命名' },
    ...path.filter((item) => item.id !== document.rootId),
  ];
}

function getOutlineTitle(document: ZhiJianDocument, focusNodeId: NodeId | null): string {
  const visibleRootId = focusNodeId ?? document.rootId;
  return getNodeContent(getNode(document, visibleRootId)) || '未命名';
}

export default function OutlineView({ store }: Props) {
  const snapshot = useDocumentStore(store);
  const document = snapshot.document as ZhiJianDocument;
  const [viewState, setViewState] = useState<MutableOutlineViewState>(() => createOutlineViewState(document));
  const shellRef = useRef<HTMLDivElement | null>(null);

  const title = getOutlineTitle(document, viewState.focusNodeId);
  const breadcrumb = getOutlineBreadcrumb(document, viewState.focusNodeId);

  const handleTitleInput = useCallback((event: React.FormEvent<HTMLHeadingElement>) => {
    const nextTitle = event.currentTarget.textContent || '未命名';
    if (nextTitle === getNodeContent(getNode(document, document.rootId))) return;
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
      const command = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (command && key === 'z' && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        store.undo();
        return;
      }
      if (command && (key === 'y' || (key === 'z' && event.shiftKey))) {
        event.preventDefault();
        event.stopPropagation();
        store.redo();
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [store]);

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
        <OutlineTreeView
          store={store}
          viewState={viewState}
          onViewStateChange={setViewState}
        />
      </main>
    </div>
  );
}
