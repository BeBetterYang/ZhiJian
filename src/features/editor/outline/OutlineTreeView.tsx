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

export default function OutlineTreeView({
  store,
  viewState,
  onViewStateChange,
}: OutlineTreeViewProps) {
  const snapshot = store.getSnapshot();
  const document = snapshot.document as ZhiJianDocument;
  const [focusState, setFocusState] = useState<FocusState | null>(null);
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

  const renderNode = (nodeId: NodeId, depth: number): React.ReactElement | null => {
    const node = document.nodes[nodeId];
    if (!node) return null;

    const hasChildren = node.children.length > 0;
    const isExpanded = hasChildren && viewState.expandedIds.has(nodeId);
    const isFocused = focusState?.nodeId === nodeId;

    return (
      <div key={nodeId} className="zj-outline-tree-item" style={{ paddingLeft: depth * 20 }}>
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
