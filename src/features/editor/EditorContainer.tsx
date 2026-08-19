import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Radio, Space, Tooltip } from '@arco-design/web-react';
import { IconRedo, IconUndo } from '@arco-design/web-react/icon';
import {
  createDocument,
  createDocumentStore,
  documentCommands,
  type DocumentStore,
} from './core';
import { useDocumentStore } from './hooks/useDocumentStore';
import { loadLocalDocument, loadServerDocument, useDocumentPersistence } from './persistence';
import OutlineView from './outline/OutlineView';
import MindMapView from './mindmap/MindMapView';
import { TUTORIAL_MAP_ID, createTutorialDocument } from '../../tutorialData';

export type EditorViewMode = 'mindmap' | 'outline';

export interface EditorContainerProps {
  mapId: string;
  title: string;
  toolbarTarget?: HTMLElement | null;
  defaultViewMode?: EditorViewMode;
  focusNodeText?: string;
  onTitleChange?: (title: string) => void;
}

const DISPLAY_MODE_STORAGE_PREFIX = 'zhijian-map-display-mode-';

function readStoredDisplayMode(mapId: string, fallback: EditorViewMode): EditorViewMode {
  const value = localStorage.getItem(`${DISPLAY_MODE_STORAGE_PREFIX}${mapId}`);
  return value === 'outline' || value === 'mindmap' ? value : fallback;
}

function createEditorDocumentStore(mapId: string, title: string): DocumentStore {
  const storedDocument = loadLocalDocument(mapId);
  if (storedDocument) return createDocumentStore(storedDocument);

  if (mapId === TUTORIAL_MAP_ID) {
    const store = createDocumentStore(createTutorialDocument({ id: mapId }));
    store.markSaved();
    return store;
  }

  const document = createDocument({ id: mapId, title: title || '未命名' });
  const store = createDocumentStore(document);
  store.execute(documentCommands.createChild(document.rootId, { content: '' }), { recordHistory: false });
  store.markSaved();
  return store;
}

export default function EditorContainer({
  mapId,
  title,
  toolbarTarget,
  defaultViewMode = 'mindmap',
  onTitleChange,
}: EditorContainerProps) {
  const [store] = useState<DocumentStore>(() => createEditorDocumentStore(mapId, title));
  const [mode, setMode] = useState<EditorViewMode>(() => readStoredDisplayMode(mapId, defaultViewMode));
  const snapshot = useDocumentStore(store);
  const canUndo = snapshot.history.undoStack.length > 0;
  const canRedo = snapshot.history.redoStack.length > 0;

  useDocumentPersistence({ store, documentId: mapId });

  useEffect(() => {
    let disposed = false;
    void loadServerDocument(mapId)
      .then((serverDocument) => {
        if (disposed || !serverDocument) return;
        store.replaceDocument(serverDocument, { resetHistory: true, dirty: false, recordHistory: false });
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, [mapId, store]);

  useEffect(() => {
    if (!onTitleChange) return undefined;
    let previousTitle = store.getDocument().title;
    onTitleChange(previousTitle);
    return store.subscribe(() => {
      const nextTitle = store.getDocument().title;
      if (nextTitle === previousTitle) return;
      previousTitle = nextTitle;
      onTitleChange(nextTitle);
    });
  }, [onTitleChange, store]);

  const changeMode = useCallback((nextMode: EditorViewMode) => {
    setMode(nextMode);
    localStorage.setItem(`${DISPLAY_MODE_STORAGE_PREFIX}${mapId}`, nextMode);
  }, [mapId]);

  const toolbar = useMemo(() => (
    <div className="zj-editor-toolbar">
      <Radio.Group
        type="button"
        size="small"
        value={mode}
        onChange={(value) => changeMode(value as EditorViewMode)}
      >
        <Radio value="mindmap">导图</Radio>
        <Radio value="outline">大纲</Radio>
      </Radio.Group>
      <Space size={4}>
        <Tooltip content="撤销 (Ctrl+Z)">
          <Button
            type="text"
            size="small"
            icon={<IconUndo />}
            disabled={!canUndo}
            onClick={() => store.undo()}
            aria-label="撤销"
          />
        </Tooltip>
        <Tooltip content="重做 (Ctrl+Y)">
          <Button
            type="text"
            size="small"
            icon={<IconRedo />}
            disabled={!canRedo}
            onClick={() => store.redo()}
            aria-label="重做"
          />
        </Tooltip>
      </Space>
    </div>
  ), [canRedo, canUndo, changeMode, mode, store]);

  return (
    <div className="zj-editor-container">
      {toolbarTarget ? createPortal(toolbar, toolbarTarget) : toolbar}
      <div className="zj-editor-body">
        {mode === 'outline' ? (
          <OutlineView store={store} />
        ) : (
          <MindMapView store={store} />
        )}
      </div>
    </div>
  );
}
