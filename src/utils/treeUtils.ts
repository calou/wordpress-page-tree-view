import type { TreeNode } from '../types';

/** Decode HTML entities and strip tags — use at node-creation time, not in render. */
export function htmlToText(html: string): string {
  const el = document.createElement('span');
  el.innerHTML = html;
  return el.textContent ?? html;
}

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

/** Recursively apply an updater to the node with nodeId. */
export function updateNodeInTree(
  tree: TreeNode[],
  nodeId: string,
  updater: (n: TreeNode) => TreeNode
): TreeNode[] {
  return tree.map((node) => {
    if (node.id === nodeId) return updater(node);
    if (node.children?.length) {
      return { ...node, children: updateNodeInTree(node.children, nodeId, updater) };
    }
    return node;
  });
}
