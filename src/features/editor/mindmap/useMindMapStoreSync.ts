import { useEffect, type MutableRefObject } from 'react';
import type MindMap from 'simple-mind-map';
import type { DocumentStore } from '../core';
import { useDocumentStore } from '../hooks/useDocumentStore';
import { cloneMindMapData, documentToMindMapData } from './mindMapAdapter';
import type { MindMapViewNode, MindMapViewState } from './mindMapTypes';

export interface UseMindMapStoreSyncOptions {
  store: DocumentStore;
  mindMapRef: MutableRefObject<MindMap | null>;
  previousDataRef: MutableRefObject<MindMapViewNode>;
  isApplyingStoreUpdateRef: MutableRefObject<boolean>;
  viewState?: MindMapViewState;
  transformData?: (data: MindMapViewNode) => MindMapViewNode;
}

export function useMindMapStoreSync({
  store,
  mindMapRef,
  previousDataRef,
  isApplyingStoreUpdateRef,
  viewState,
  transformData,
}: UseMindMapStoreSyncOptions): void {
  const snapshot = useDocumentStore(store);

  useEffect(() => {
    const instance = mindMapRef.current;
    if (!instance) return;
    const nextData = transformData
      ? transformData(documentToMindMapData(snapshot.document, viewState))
      : documentToMindMapData(snapshot.document, viewState);
    isApplyingStoreUpdateRef.current = true;
    try {
      instance.setData(nextData);
      previousDataRef.current = cloneMindMapData(nextData);
    } finally {
      isApplyingStoreUpdateRef.current = false;
    }
  }, [isApplyingStoreUpdateRef, mindMapRef, previousDataRef, snapshot.document, transformData, viewState]);
}
