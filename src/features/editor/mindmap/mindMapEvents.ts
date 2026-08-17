import type { MutableRefObject } from 'react';
import type { DocumentStore } from '../core';
import type { MindMapViewNode } from './mindMapTypes';
import { cloneMindMapData } from './mindMapAdapter';
import { diffMindMapChangeToCommands } from './mindMapDiff';

export interface ApplyMindMapDataChangeOptions {
  store: DocumentStore;
  previousDataRef: MutableRefObject<MindMapViewNode>;
  isApplyingStoreUpdateRef: MutableRefObject<boolean>;
  nextData: unknown;
}

export function isMindMapViewNode(value: unknown): value is MindMapViewNode {
  return Boolean(
    value
    && typeof value === 'object'
    && 'data' in value
    && (value as MindMapViewNode).data
    && typeof (value as MindMapViewNode).data === 'object'
    && typeof (value as MindMapViewNode).data.uid === 'string'
  );
}

export function applyMindMapDataChange({
  store,
  previousDataRef,
  isApplyingStoreUpdateRef,
  nextData,
}: ApplyMindMapDataChangeOptions): boolean {
  if (isApplyingStoreUpdateRef.current) return false;
  if (!isMindMapViewNode(nextData)) return false;

  const { commands } = diffMindMapChangeToCommands(
    store.getSnapshot().document,
    previousDataRef.current,
    nextData,
  );
  previousDataRef.current = cloneMindMapData(nextData);
  if (commands.length === 0) return false;
  store.executeTransaction(commands);
  return true;
}
