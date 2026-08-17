import type { MindMapViewState } from './mindMapTypes';

export function createMindMapViewState(): MindMapViewState {
  return {
    selectedNodeIds: [],
    expandedIds: new Set(),
  };
}
