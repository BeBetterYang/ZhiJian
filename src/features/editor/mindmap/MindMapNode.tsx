import { useEffect, useRef } from 'react';
import { Handle, Position } from '@xyflow/react';
import { NodeContentEditor, type NodeContentEditorHandle } from '../shared/NodeContentEditor';
import {
  createId,
  documentCommands,
  getNode,
  getNodeContent,
  getParent,
  isContentNode,
  type DocumentStore,
  type NodeId,
  type ZhiJianDocument,
  type ZhiJianNode,
} from '../core';

interface MindMapNodeProps {
  data: {
    node: ZhiJianNode;
    store: DocumentStore;
    focused: boolean;
    autoFocus?: 'content' | 'description';
    autoFocusOffset?: number;
    onRegisterHandle: (handle: NodeContentEditorHandle) => void;
    onUnregisterHandle: () => void;
    onFocusChange: (focusState: { nodeId: NodeId; field: 'content' | 'description'; offset?: number }) => void;
  };
}

export function MindMapNode({ data }: MindMapNodeProps) {
  const { node, store, focused, autoFocus, autoFocusOffset, onRegisterHandle, onUnregisterHandle, onFocusChange } = data;
  const editorRef = useRef<NodeContentEditorHandle>(null);
  const document = store.getSnapshot().document as ZhiJianDocument;

  // Register/unregister handle with parent
  useEffect(() => {
    if (editorRef.current) {
      onRegisterHandle(editorRef.current);
    }
    return () => {
      onUnregisterHandle();
    };
  }, [onRegisterHandle, onUnregisterHandle]);

  const handleContentChange = (content: string) => {
    store.execute(
      documentCommands.updateContent(node.id, content, { mergeKey: `mindmap-content:${node.id}` })
    );
  };

  const handleDescriptionChange = (description: string | undefined) => {
    if (description === undefined) {
      store.execute(documentCommands.removeDescription(node.id));
    } else {
      store.execute(documentCommands.setDescription(node.id, description));
    }
  };

  const handleEnter = (offset: number) => {
    const content = getNodeContent(node);
    if (offset < content.length) {
      // Split node
      const newNodeId = createId();
      store.execute(documentCommands.splitNode(node.id, offset, newNodeId));
      onFocusChange({ nodeId: newNodeId, field: 'content', offset: 0 });
    } else {
      // Create sibling
      const parent = getParent(document, node.id);
      if (!parent) return;
      const index = parent.children.indexOf(node.id);
      const newNodeId = createId();
      store.execute(
        documentCommands.createNode({
          type: 'createNode',
          parentId: parent.id,
          index: index + 1,
          node: { id: newNodeId, content: '' },
        })
      );
      onFocusChange({ nodeId: newNodeId, field: 'content', offset: 0 });
    }
  };

  const handleShiftEnter = () => {
    const currentNode = getNode(document, node.id);
    if (!isContentNode(currentNode)) return;
    if (currentNode.description === undefined) {
      store.execute(documentCommands.setDescription(node.id, ''));
    }
    onFocusChange({ nodeId: node.id, field: 'description', offset: 0 });
  };

  const handleBackspaceAtContentStart = () => {
    const content = getNodeContent(node);
    if (content.length === 0) {
      // Delete empty node - focus parent
      const parent = getParent(document, node.id);
      store.execute(documentCommands.deleteNode(node.id));
      if (parent && parent.id !== document.rootId) {
        onFocusChange({
          nodeId: parent.id,
          field: 'content',
          offset: getNodeContent(parent).length,
        });
      }
    } else {
      // Merge with parent
      const parent = getParent(document, node.id);
      if (parent && parent.id !== document.rootId && isContentNode(parent)) {
        const prevLength = parent.content.length;
        store.execute(documentCommands.mergeNode(node.id, parent.id));
        onFocusChange({ nodeId: parent.id, field: 'content', offset: prevLength });
      }
    }
  };

  const handleBackspaceAtDescriptionStart = () => {
    store.execute(documentCommands.removeDescription(node.id));
    onFocusChange({ nodeId: node.id, field: 'content', offset: getNodeContent(node).length });
  };

  const handleTab = () => {
    // Create child
    const newNodeId = createId();
    store.execute(
      documentCommands.createNode({
        type: 'createNode',
        parentId: node.id,
        index: 0,
        node: { id: newNodeId, content: '' },
      })
    );
    onFocusChange({ nodeId: newNodeId, field: 'content', offset: 0 });
  };

  const handleShiftTab = () => {
    // No-op in mindmap (indent only creates children via Tab)
  };

  const handleTodoToggle = () => {
    const currentNode = getNode(document, node.id);
    if (isContentNode(currentNode) && currentNode.todo) {
      store.execute(documentCommands.setTodoChecked(node.id, !currentNode.todo.checked));
    }
  };

  return (
    <div className="zj-mindmap-node">
      <Handle type="target" position={Position.Left} />
      <div className="zj-mindmap-node-content">
        <NodeContentEditor
          ref={editorRef}
          node={node}
          focused={focused}
          autoFocus={autoFocus}
          autoFocusOffset={autoFocusOffset}
          onContentChange={handleContentChange}
          onDescriptionChange={handleDescriptionChange}
          onEnter={handleEnter}
          onShiftEnter={handleShiftEnter}
          onBackspaceAtContentStart={handleBackspaceAtContentStart}
          onBackspaceAtDescriptionStart={handleBackspaceAtDescriptionStart}
          onTab={handleTab}
          onShiftTab={handleShiftTab}
          onTodoToggle={handleTodoToggle}
        />
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
