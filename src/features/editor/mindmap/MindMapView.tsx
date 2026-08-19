import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
  type OnNodesChange,
  type OnEdgesChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  type DocumentStore,
  type NodeId,
  type ZhiJianDocument,
} from '../core';
import { MindMapNode } from './MindMapNode';
import { computeMindMapLayout } from './mindMapLayout';
import './mindMap.css';

const nodeTypes = {
  mindMapNode: MindMapNode,
};

interface MindMapViewProps {
  store: DocumentStore;
}

interface FocusState {
  nodeId: NodeId;
  field: 'content' | 'description';
  offset?: number;
}

export default function MindMapView({ store }: MindMapViewProps) {
  const snapshot = store.getSnapshot();
  const document = snapshot.document as ZhiJianDocument;
  const [focusState, setFocusState] = useState<FocusState | null>(null);
  const nodeHandlesRef = useRef<Map<NodeId, { focus: (field: 'content' | 'description', offset?: number) => void }>>(new Map());

  // Convert Document tree to React Flow nodes and edges
  const { nodes, edges } = useMemo(() => {
    const layoutNodes = computeMindMapLayout(document);

    const flowNodes: Node[] = layoutNodes.map((layoutNode) => ({
      id: layoutNode.id,
      type: 'mindMapNode',
      position: { x: layoutNode.x, y: layoutNode.y },
      data: {
        node: document.nodes[layoutNode.id],
        store,
        focused: focusState?.nodeId === layoutNode.id,
        autoFocus: focusState?.nodeId === layoutNode.id ? focusState.field : undefined,
        autoFocusOffset: focusState?.nodeId === layoutNode.id ? focusState.offset : undefined,
        onRegisterHandle: (handle: { focus: (field: 'content' | 'description', offset?: number) => void }) => {
          nodeHandlesRef.current.set(layoutNode.id, handle);
        },
        onUnregisterHandle: () => {
          nodeHandlesRef.current.delete(layoutNode.id);
        },
        onFocusChange: (newFocusState: FocusState) => {
          setFocusState(newFocusState);
        },
      },
      draggable: false,
    }));

    const flowEdges: Edge[] = [];
    for (const node of Object.values(document.nodes)) {
      if (node.parentId && node.parentId !== document.rootId) {
        flowEdges.push({
          id: `${node.parentId}-${node.id}`,
          source: node.parentId,
          target: node.id,
          type: 'smoothstep',
          animated: false,
        });
      }
    }

    return { nodes: flowNodes, edges: flowEdges };
  }, [document, store, focusState]);

  // Use nodes/edges directly as state - no need for separate internal state
  const [internalNodes, setInternalNodes] = useState<Node[]>([]);
  const [internalEdges, setInternalEdges] = useState<Edge[]>([]);

  // Initialize internal state on mount
  useEffect(() => {
    setInternalNodes(nodes);
    setInternalEdges(edges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update internal state when nodes/edges change from document updates
  useEffect(() => {
    setInternalNodes(nodes);
  }, [nodes]);

  useEffect(() => {
    setInternalEdges(edges);
  }, [edges]);

  const onNodesChange: OnNodesChange = useCallback((changes: NodeChange[]) => {
    // Block position changes - layout is auto-computed
    const filteredChanges = changes.filter(change => change.type !== 'position');
    setInternalNodes(nds => applyNodeChanges(filteredChanges, nds));
  }, []);

  const onEdgesChange: OnEdgesChange = useCallback((changes: EdgeChange[]) => {
    setInternalEdges(eds => applyEdgeChanges(changes, eds));
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        store.undo();
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
        event.preventDefault();
        store.redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [store]);

  // Focus restoration after undo/redo
  useEffect(() => {
    return store.subscribe(() => {
      if (focusState) {
        const node = document.nodes[focusState.nodeId];
        if (node) {
          // Node still exists - restore focus
          requestAnimationFrame(() => {
            const handle = nodeHandlesRef.current.get(focusState.nodeId);
            if (handle) {
              handle.focus(focusState.field, focusState.offset);
            }
          });
        } else {
          // Node deleted
          setFocusState(null);
        }
      }
    });
  }, [document, focusState, store]);

  return (
    <div className="zj-mindmap-view">
      <ReactFlow
        nodes={internalNodes}
        edges={internalEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: false,
        }}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
