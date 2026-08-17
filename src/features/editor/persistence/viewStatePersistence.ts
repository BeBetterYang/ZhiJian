export interface EditorViewState {
  mode?: 'mindmap' | 'outline';
  outline?: {
    focusNodeId?: string | null;
    expandedIds?: string[];
  };
  mindmap?: {
    scale?: number;
    x?: number;
    y?: number;
    expandedIds?: string[];
    layout?: string;
    theme?: string;
    backgroundColor?: string;
    connectionLineStyle?: string;
  };
}

const VIEW_STATE_STORAGE_PREFIX = 'zhijian-view-state-v1-';

export function getViewStateStorageKey(documentId: string): string {
  return `${VIEW_STATE_STORAGE_PREFIX}${documentId}`;
}

export function saveViewState(documentId: string, viewState: EditorViewState): void {
  localStorage.setItem(getViewStateStorageKey(documentId), JSON.stringify(viewState));
}

export function loadViewState(documentId: string): EditorViewState | null {
  const raw = localStorage.getItem(getViewStateStorageKey(documentId));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as EditorViewState;
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}
