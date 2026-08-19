import type { NodeId, ZhiJianDocument } from './documentTypes';

export interface TreeValidationIssue {
  code:
    | 'ROOT_MISSING'
    | 'ROOT_PARENT_INVALID'
    | 'ROOT_BLOCK_TYPE_INVALID'
    | 'CONTENT_BLOCK_TYPE_INVALID'
    | 'TABLE_NODE_INVALID'
    | 'NODE_ID_MISMATCH'
    | 'PARENT_MISSING'
    | 'CHILD_MISSING'
    | 'PARENT_CHILD_MISMATCH'
    | 'DUPLICATE_CHILD'
    | 'MULTIPLE_PARENTS'
    | 'CYCLE'
    | 'UNREACHABLE_NODE';
  message: string;
  nodeId?: NodeId;
}

export interface TreeValidationResult {
  valid: boolean;
  issues: TreeValidationIssue[];
}

export function validateDocument(document: ZhiJianDocument): TreeValidationResult {
  const issues: TreeValidationIssue[] = [];
  const root = document.nodes[document.rootId];

  if (!root) {
    issues.push({
      code: 'ROOT_MISSING',
      message: `Root node "${document.rootId}" does not exist.`,
      nodeId: document.rootId,
    });
    return { valid: false, issues };
  }

  if (root.parentId !== null) {
    issues.push({
      code: 'ROOT_PARENT_INVALID',
      message: 'Root node must not have a parent.',
      nodeId: root.id,
    });
  }

  if (root.kind !== 'content' || root.blockType !== 'root') {
    issues.push({
      code: 'ROOT_BLOCK_TYPE_INVALID',
      message: 'Root node must be a content node using the special root block type.',
      nodeId: root.id,
    });
  }

  for (const [key, node] of Object.entries(document.nodes)) {
    if (key !== node.id) {
      issues.push({
        code: 'NODE_ID_MISMATCH',
        message: `Node map key "${key}" does not match node id "${node.id}".`,
        nodeId: node.id,
      });
    }

    if (node.kind === 'content') {
      if (node.id !== document.rootId && node.blockType === 'root') {
        issues.push({
          code: 'CONTENT_BLOCK_TYPE_INVALID',
          message: 'Only the document root may use the root block type.',
          nodeId: node.id,
        });
      }
    } else {
      if (node.id === document.rootId) {
        // Root-kind mismatch is already reported by ROOT_BLOCK_TYPE_INVALID.
      } else if (!node.table || !Array.isArray(node.table.rows)) {
        issues.push({
          code: 'TABLE_NODE_INVALID',
          message: `Table node "${node.id}" must carry a table with rows.`,
          nodeId: node.id,
        });
      }
    }

    if (node.parentId !== null && !document.nodes[node.parentId]) {
      issues.push({
        code: 'PARENT_MISSING',
        message: `Parent "${node.parentId}" does not exist.`,
        nodeId: node.id,
      });
    }

    const childIds = new Set<NodeId>();
    for (const childId of node.children) {
      if (childIds.has(childId)) {
        issues.push({
          code: 'DUPLICATE_CHILD',
          message: `Child "${childId}" appears more than once under "${node.id}".`,
          nodeId: childId,
        });
      }
      childIds.add(childId);

      const child = document.nodes[childId];
      if (!child) {
        issues.push({
          code: 'CHILD_MISSING',
          message: `Child "${childId}" does not exist.`,
          nodeId: childId,
        });
      } else if (child.parentId !== node.id) {
        issues.push({
          code: 'PARENT_CHILD_MISMATCH',
          message: `Child "${childId}" points to parent "${child.parentId}" instead of "${node.id}".`,
          nodeId: childId,
        });
      }
    }
  }

  const seenParents = new Map<NodeId, NodeId>();
  for (const node of Object.values(document.nodes)) {
    for (const childId of node.children) {
      const previousParent = seenParents.get(childId);
      if (previousParent && previousParent !== node.id) {
        issues.push({
          code: 'MULTIPLE_PARENTS',
          message: `Node "${childId}" appears under both "${previousParent}" and "${node.id}".`,
          nodeId: childId,
        });
      }
      seenParents.set(childId, node.id);
    }
  }

  const visiting = new Set<NodeId>();
  const visited = new Set<NodeId>();

  const visit = (nodeId: NodeId) => {
    if (visiting.has(nodeId)) {
      issues.push({
        code: 'CYCLE',
        message: `Cycle detected at node "${nodeId}".`,
        nodeId,
      });
      return;
    }
    if (visited.has(nodeId)) return;

    const node = document.nodes[nodeId];
    if (!node) return;
    visiting.add(nodeId);
    for (const childId of node.children) visit(childId);
    visiting.delete(nodeId);
    visited.add(nodeId);
  };

  visit(document.rootId);

  for (const nodeId of Object.keys(document.nodes)) {
    if (!visited.has(nodeId)) {
      issues.push({
        code: 'UNREACHABLE_NODE',
        message: `Node "${nodeId}" is not reachable from root.`,
        nodeId,
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function assertValidDocument(document: ZhiJianDocument): void {
  const result = validateDocument(document);
  if (!result.valid) {
    throw new Error(result.issues.map((issue) => `${issue.code}: ${issue.message}`).join('\n'));
  }
}
