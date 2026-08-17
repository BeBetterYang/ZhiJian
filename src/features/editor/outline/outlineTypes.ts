import type { NodeId } from '../core';

export interface OutlineViewState {
  focusNodeId: NodeId | null;
  expandedIds: ReadonlySet<NodeId>;
}

export interface MutableOutlineViewState {
  focusNodeId: NodeId | null;
  expandedIds: Set<NodeId>;
}

export interface OutlineHistoryControls {
  undo: () => boolean;
  redo: () => boolean;
}
