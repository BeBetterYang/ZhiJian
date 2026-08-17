import type MindMap from 'simple-mind-map';
import type { MutableRefObject } from 'react';
import type { DocumentStore } from '../core';
import { useMindMapStoreSync } from './useMindMapStoreSync';
import type { MindMapViewNode, MindMapViewState } from './mindMapTypes';

export interface MindMapViewProps {
  store: DocumentStore;
  mindMapRef: MutableRefObject<MindMap | null>;
  previousDataRef: MutableRefObject<MindMapViewNode>;
  isApplyingStoreUpdateRef: MutableRefObject<boolean>;
  viewState?: MindMapViewState;
  transformData?: (data: MindMapViewNode) => MindMapViewNode;
}

export default function MindMapView({
  store,
  mindMapRef,
  previousDataRef,
  isApplyingStoreUpdateRef,
  viewState,
  transformData,
}: MindMapViewProps) {
  useMindMapStoreSync({
    store,
    mindMapRef,
    previousDataRef,
    isApplyingStoreUpdateRef,
    viewState,
    transformData,
  });
  return null;
}
