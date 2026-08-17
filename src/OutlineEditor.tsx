import { useEffect, useRef, useState } from 'react';
import {
  createDocument,
  createDocumentStore,
  documentCommands,
  type DocumentStore,
} from './features/editor/core';
import OutlineView from './features/editor/outline/OutlineView';
import type { OutlineHistoryControls } from './features/editor/outline/outlineTypes';

type Props = {
  mapId: string;
  title: string;
  onTitleChange?: (title: string) => void;
  onHistoryReady?: (controls: OutlineHistoryControls) => void;
};

function createOutlineStore(mapId: string, title: string) {
  const document = createDocument({
    id: mapId,
    title: title || '未命名',
  });
  const nextStore = createDocumentStore(document);
  nextStore.execute(documentCommands.createNode({
    type: 'createNode',
    parentId: document.rootId,
    node: {
      content: '',
    },
  }), { recordHistory: false });
  return nextStore;
}

export default function OutlineEditor({ mapId, title, onTitleChange, onHistoryReady }: Props) {
  const [store] = useState<DocumentStore>(() => createOutlineStore(mapId, title));
  const titleRef = useRef(title);

  useEffect(() => {
    if (titleRef.current === title) return;
    titleRef.current = title;
    const document = store.getDocument();
    store.execute(documentCommands.updateContent(document.rootId, title || '未命名'), { recordHistory: false });
  }, [store, title]);

  return (
    <OutlineView
      store={store}
      onTitleChange={onTitleChange}
      onHistoryReady={onHistoryReady}
    />
  );
}
