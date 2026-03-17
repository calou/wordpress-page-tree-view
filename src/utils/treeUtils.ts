import type { TreeNode } from '../types';

/** Recursively add newNode as the last child of the node with parentId. */
export function addChildToNode(
  tree: TreeNode[],
  parentId: string,
  newNode: TreeNode
): TreeNode[] {
  return tree.map((node) => {
    if (node.id === parentId) {
      return {
        ...node,
        children: [...(node.children ?? []), newNode],
        childrenLoaded: true,
      };
    }
    if (node.children?.length) {
      return { ...node, children: addChildToNode(node.children, parentId, newNode) };
    }
    return node;
  });
}

/** Recursively insert newNode immediately before the node with nodeId. */
export function addSiblingBefore(
  tree: TreeNode[],
  nodeId: string,
  newNode: TreeNode
): TreeNode[] {
  const idx = tree.findIndex((n) => n.id === nodeId);
  if (idx !== -1) {
    const result = [...tree];
    result.splice(idx, 0, newNode);
    return result;
  }
  return tree.map((node) => {
    if (node.children?.length) {
      return { ...node, children: addSiblingBefore(node.children, nodeId, newNode) };
    }
    return node;
  });
}

/** Recursively insert newNode immediately after the node with nodeId. */
export function addSiblingAfter(
  tree: TreeNode[],
  nodeId: string,
  newNode: TreeNode
): TreeNode[] {
  const idx = tree.findIndex((n) => n.id === nodeId);
  if (idx !== -1) {
    const result = [...tree];
    result.splice(idx + 1, 0, newNode);
    return result;
  }
  return tree.map((node) => {
    if (node.children?.length) {
      return { ...node, children: addSiblingAfter(node.children, nodeId, newNode) };
    }
    return node;
  });
}

/** Recursively remove the node with nodeId from the tree. */
export function removeNodeFromTree(tree: TreeNode[], nodeId: string): TreeNode[] {
  return tree
    .filter((node) => node.id !== nodeId)
    .map((node) => {
      if (node.children?.length) {
        return { ...node, children: removeNodeFromTree(node.children, nodeId) };
      }
      return node;
    });
}
