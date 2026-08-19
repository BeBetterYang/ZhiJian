import { useEffect, useRef, useState } from 'react';
import {
  createId,
  documentCommands,
  getNode,
  getNodeContent,
  getParent,
  getPreviousVisibleNodeId,
  isContentNode,
  type DocumentStore,
  type NodeId,
  type ZhiJianDocument,
} from '../core';
import { NodeContentEditor, type NodeContentEditorHandle } from '../shared/NodeContentEditor';
import type { MutableOutlineViewState } from './outlineTypes';
import './outlineTree.css';

interface OutlineTreeViewProps {
  store: DocumentStore;
  viewState: MutableOutlineViewState;
  onViewStateChange: (state: MutableOutlineViewState) => void;
}

interface FocusState {
  nodeId: NodeId;
  field: 'content' | 'description';
  offset?: number;
}

interface DragState {
  sourceId: NodeId;
  targetId: NodeId | null;
  position: 'before' | 'after' | 'child';
}

export default function OutlineTreeView({
  store,
  viewState,
  onViewStateChange,
}: OutlineTreeViewProps) {
  const snapshot = store.getSnapshot();
  const document = snapshot.document as ZhiJianDocument;
  const [focusState, setFocusState] = useState<FocusState | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const editorRefs = useRef<Map<NodeId, NodeContentEditorHandle>>(new Map());

  const visibleRootId = viewState.focusNodeId ?? document.rootId;
  const visibleRoot = getNode(document, visibleRootId);

  // Apply focus when focusState changes
  useEffect(() => {
    if (focusState) {
      const handle = editorRefs.current.get(focusState.nodeId);
      if (handle) {
        handle.focus(focusState.field, focusState.offset);
      }
    }
  }, [focusState]);

  // Restore focus after undo/redo
  useEffect(() => {
    const unsubscribe = store.subscribe(() => {
      // On undo/redo, if a node is focused, try to preserve focus
      if (focusState) {
        const node = document.nodes[focusState.nodeId];
        if (node) {
          // Node still exists, restore focus
          requestAnimationFrame(() => {
            const handle = editorRefs.current.get(focusState.nodeId);
            if (handle) {
              const currentSel = handle.getSelection();
              if (currentSel) {
                handle.focus(currentSel.field, currentSel.offset);
              } else {
                // Fallback: focus at end
                const content =
                  focusState.field === 'content'
                    ? getNodeContent(node)
                    : isContentNode(node)
                      ? node.description ?? ''
                      : '';
                handle.focus(focusState.field, content.length);
              }
            }
          });
        }
      }
    });
    return unsubscribe;
  }, [document, focusState, store]);

  const handleContentChange = (nodeId: NodeId) => (content: string) => {
    store.execute(
      documentCommands.updateContent(nodeId, content, { mergeKey: `outline-content:${nodeId}` })
    );
  };

  const handleDescriptionChange = (nodeId: NodeId) => (description: string | undefined) => {
    if (description === undefined) {
      store.execute(documentCommands.removeDescription(nodeId));
    } else {
      store.execute(documentCommands.setDescription(nodeId, description));
    }
  };

  const handleEnter = (nodeId: NodeId) => (offset: number) => {
    const node = getNode(document, nodeId);
    const content = getNodeContent(node);
    if (offset < content.length) {
      // Split node
      const newNodeId = createId();
      store.execute(documentCommands.splitNode(nodeId, offset, newNodeId));
      setFocusState({ nodeId: newNodeId, field: 'content', offset: 0 });
    } else {
      // Create sibling at end
      const parent = getParent(document, nodeId);
      if (!parent) return;
      const index = parent.children.indexOf(nodeId);
      const newNodeId = createId();
      store.execute(
        documentCommands.createNode({
          type: 'createNode',
          parentId: parent.id,
          index: index + 1,
          node: { id: newNodeId, content: '' },
        })
      );
      setFocusState({ nodeId: newNodeId, field: 'content', offset: 0 });
    }
  };

  const handleShiftEnter = (nodeId: NodeId) => () => {
    const node = getNode(document, nodeId);
    if (!isContentNode(node)) return;
    if (node.description === undefined) {
      // Create description
      store.execute(documentCommands.setDescription(nodeId, ''));
    }
    // Always focus description (whether newly created or already exists)
    setFocusState({ nodeId, field: 'description', offset: 0 });
  };

  const handleBackspaceAtContentStart = (nodeId: NodeId) => () => {
    const node = getNode(document, nodeId);
    const content = getNodeContent(node);
    if (content.length === 0) {
      // Delete empty node
      const previousId = getPreviousVisibleNodeId(document, nodeId);
      store.execute(documentCommands.deleteNode(nodeId));
      if (previousId) {
        const prevNode = document.nodes[previousId];
        if (prevNode) {
          setFocusState({
            nodeId: previousId,
            field: 'content',
            offset: getNodeContent(prevNode).length,
          });
        }
      }
    } else {
      // Merge with previous
      const previousId = getPreviousVisibleNodeId(document, nodeId);
      if (previousId) {
        const prevNode = document.nodes[previousId];
        if (prevNode && isContentNode(prevNode)) {
          const prevLength = prevNode.content.length;
          store.execute(documentCommands.mergeNode(nodeId, previousId));
          setFocusState({ nodeId: previousId, field: 'content', offset: prevLength });
        }
      }
    }
  };

  const handleBackspaceAtDescriptionStart = (nodeId: NodeId) => () => {
    const node = getNode(document, nodeId);
    store.execute(documentCommands.removeDescription(nodeId));
    setFocusState({ nodeId, field: 'content', offset: getNodeContent(node).length });
  };

  const handleTab = (nodeId: NodeId) => () => {
    store.execute(documentCommands.indentNode(nodeId));
  };

  const handleShiftTab = (nodeId: NodeId) => () => {
    store.execute(documentCommands.outdentNode(nodeId));
  };

  const handleTodoToggle = (nodeId: NodeId) => () => {
    const node = getNode(document, nodeId);
    if (isContentNode(node) && node.todo) {
      store.execute(documentCommands.setTodoChecked(nodeId, !node.todo.checked));
    }
  };

  const handleDragStart = (nodeId: NodeId) => (event: React.DragEvent) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', nodeId);
    setDragState({ sourceId: nodeId, targetId: null, position: 'after' });
  };

  const handleDragOver = (nodeId: NodeId) => (event: React.DragEvent) => {
    event.preventDefault();
    if (!dragState || dragState.sourceId === nodeId) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const y = event.clientY - rect.top;
    const height = rect.height;

    let position: 'before' | 'after' | 'child' = 'after';
    if (y < height * 0.25) {
      position = 'before';
    } else if (y > height * 0.75) {
      position = 'after';
    } else {
      position = 'child';
    }

    setDragState({ sourceId: dragState.sourceId, targetId: nodeId, position });
  };

  const handleDragEnd = () => {
    setDragState(null);
  };

  const handleDrop = (nodeId: NodeId) => (event: React.DragEvent) => {
    event.preventDefault();
    if (!dragState || dragState.sourceId === nodeId) {
      setDragState(null);
      return;
    }

    const sourceId = dragState.sourceId;
    const targetId = nodeId;
    const position = dragState.position;

    // Prevent dropping on own descendant
    let current: NodeId | undefined = targetId;
    while (current) {
      if (current === sourceId) {
        setDragState(null);
        return;
      }
      const parent = getParent(document, current);
      current = parent?.id;
    }

    const targetParent = getParent(document, targetId);

    if (position === 'child') {
      // Move as first child
      store.execute(documentCommands.moveNode({ nodeId: sourceId, parentId: targetId, index: 0 }));
    } else if (position === 'before') {
      // Move before target
      if (targetParent) {
        const index = targetParent.children.indexOf(targetId);
        store.execute(documentCommands.moveNode({ nodeId: sourceId, parentId: targetParent.id, index }));
      }
    } else {
      // Move after target
      if (targetParent) {
        const index = targetParent.children.indexOf(targetId);
        store.execute(documentCommands.moveNode({ nodeId: sourceId, parentId: targetParent.id, index: index + 1 }));
      }
    }

    setDragState(null);
  };

  const renderNode = (nodeId: NodeId, depth: number): React.ReactElement | null => {
    const node = document.nodes[nodeId];
    if (!node) return null;

    const hasChildren = node.children.length > 0;
    const isExpanded = hasChildren && viewState.expandedIds.has(nodeId);
    const isFocused = focusState?.nodeId === nodeId;
    const isDragSource = dragState?.sourceId === nodeId;
    const isDragTarget = dragState?.targetId === nodeId;

    const itemClasses = ['zj-outline-tree-item'];
    if (isDragSource) itemClasses.push('dragging');
    if (isDragTarget && dragState) {
      itemClasses.push(`drop-${dragState.position}`);
    }

    return (
      <div
        key={nodeId}
        className={itemClasses.join(' ')}
        style={{ paddingLeft: depth * 20 }}
        draggable
        onDragStart={handleDragStart(nodeId)}
        onDragOver={handleDragOver(nodeId)}
        onDragEnd={handleDragEnd}
        onDrop={handleDrop(nodeId)}
      >
        <div className="zj-outline-tree-node">
          {hasChildren && (
            <button
              className={`zj-outline-tree-toggle ${isExpanded ? 'expanded' : 'collapsed'}`}
              onClick={() => {
                const expandedIds = new Set(viewState.expandedIds);
                if (isExpanded) {
                  expandedIds.delete(nodeId);
                } else {
                  expandedIds.add(nodeId);
                }
                onViewStateChange({ ...viewState, expandedIds });
              }}
              aria-label={isExpanded ? '折叠' : '展开'}
            >
              {isExpanded ? '▼' : '▶'}
            </button>
          )}
          <div className="zj-outline-tree-content">
            <NodeContentEditor
              ref={(handle) => {
                if (handle) {
                  editorRefs.current.set(nodeId, handle);
                } else {
                  editorRefs.current.delete(nodeId);
                }
              }}
              node={node}
              focused={isFocused}
              autoFocus={isFocused ? focusState.field : undefined}
              autoFocusOffset={isFocused ? focusState.offset : undefined}
              onContentChange={handleContentChange(nodeId)}
              onDescriptionChange={handleDescriptionChange(nodeId)}
              onEnter={handleEnter(nodeId)}
              onShiftEnter={handleShiftEnter(nodeId)}
              onBackspaceAtContentStart={handleBackspaceAtContentStart(nodeId)}
              onBackspaceAtDescriptionStart={handleBackspaceAtDescriptionStart(nodeId)}
              onTab={handleTab(nodeId)}
              onShiftTab={handleShiftTab(nodeId)}
              onTodoToggle={handleTodoToggle(nodeId)}
            />
          </div>
        </div>
        {isExpanded &&
          node.children.map((childId) => renderNode(childId, depth + 1))}
      </div>
    );
  };

  return (
    <div className="zj-outline-tree">
      {visibleRoot.children.map((childId) => renderNode(childId, 0))}
    </div>
  );
}
