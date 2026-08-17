import type {
  CreateNodeInput,
  NodeId,
  ZhiJianBlockType,
  ZhiJianImage,
  ZhiJianNodeStyle,
  ZhiJianTable,
  ZhiJianTodo,
} from './documentTypes';

export type DocumentCommand =
  | { type: 'createNode'; parentId: NodeId; index?: number; node?: CreateNodeInput }
  | { type: 'deleteNode'; nodeId: NodeId }
  | { type: 'moveNode'; nodeId: NodeId; parentId: NodeId; index: number }
  | { type: 'updateContent'; nodeId: NodeId; content: string; mergeKey?: string }
  | { type: 'setBlockType'; nodeId: NodeId; blockType: ZhiJianBlockType }
  | { type: 'setTodo'; nodeId: NodeId; todo?: ZhiJianTodo }
  | { type: 'toggleTodo'; nodeId: NodeId }
  | { type: 'setTodoChecked'; nodeId: NodeId; checked: boolean }
  | { type: 'setNote'; nodeId: NodeId; note?: string }
  | { type: 'setImages'; nodeId: NodeId; images?: ZhiJianImage[] }
  | { type: 'setTable'; nodeId: NodeId; table?: ZhiJianTable }
  | { type: 'setStyle'; nodeId: NodeId; style?: ZhiJianNodeStyle }
  | { type: 'splitNode'; nodeId: NodeId; offset: number; newNodeId?: NodeId }
  | { type: 'mergeNode'; nodeId: NodeId; targetNodeId?: NodeId }
  | { type: 'indentNode'; nodeId: NodeId }
  | { type: 'outdentNode'; nodeId: NodeId }
  | { type: 'reorderNode'; nodeId: NodeId; index: number };

export const documentCommands = {
  createNode: (input: Extract<DocumentCommand, { type: 'createNode' }>): DocumentCommand => input,
  deleteNode: (nodeId: NodeId): DocumentCommand => ({ type: 'deleteNode', nodeId }),
  moveNode: (input: Omit<Extract<DocumentCommand, { type: 'moveNode' }>, 'type'>): DocumentCommand => ({
    type: 'moveNode',
    ...input,
  }),
  updateContent: (
    nodeId: NodeId,
    content: string,
    options: { mergeKey?: string } = {},
  ): DocumentCommand => ({ type: 'updateContent', nodeId, content, mergeKey: options.mergeKey }),
  setBlockType: (nodeId: NodeId, blockType: ZhiJianBlockType): DocumentCommand => ({
    type: 'setBlockType',
    nodeId,
    blockType,
  }),
  setTodo: (nodeId: NodeId, todo?: ZhiJianTodo): DocumentCommand => ({ type: 'setTodo', nodeId, todo }),
  toggleTodo: (nodeId: NodeId): DocumentCommand => ({ type: 'toggleTodo', nodeId }),
  setTodoChecked: (nodeId: NodeId, checked: boolean): DocumentCommand => ({ type: 'setTodoChecked', nodeId, checked }),
  setNote: (nodeId: NodeId, note?: string): DocumentCommand => ({ type: 'setNote', nodeId, note }),
  setImages: (nodeId: NodeId, images?: ZhiJianImage[]): DocumentCommand => ({ type: 'setImages', nodeId, images }),
  setTable: (nodeId: NodeId, table?: ZhiJianTable): DocumentCommand => ({ type: 'setTable', nodeId, table }),
  setStyle: (nodeId: NodeId, style?: ZhiJianNodeStyle): DocumentCommand => ({ type: 'setStyle', nodeId, style }),
  splitNode: (nodeId: NodeId, offset: number, newNodeId?: NodeId): DocumentCommand => ({
    type: 'splitNode',
    nodeId,
    offset,
    newNodeId,
  }),
  mergeNode: (nodeId: NodeId, targetNodeId?: NodeId): DocumentCommand => ({ type: 'mergeNode', nodeId, targetNodeId }),
  indentNode: (nodeId: NodeId): DocumentCommand => ({ type: 'indentNode', nodeId }),
  outdentNode: (nodeId: NodeId): DocumentCommand => ({ type: 'outdentNode', nodeId }),
  reorderNode: (nodeId: NodeId, index: number): DocumentCommand => ({ type: 'reorderNode', nodeId, index }),
};
