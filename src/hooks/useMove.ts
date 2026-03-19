import { useRef, useCallback } from 'react';
import { movePost } from '../api/wp';
import type { TreeNode } from '../types';

interface MoveArgs {
  dragIds: string[];
  parentId: string | null;
  index: number;
}

type SetTree = React.Dispatch<React.SetStateAction<TreeNode[]>>;

function extractNodes(
  tree: TreeNode[],
  ids: Set<string>
): { extracted: TreeNode[]; remaining: TreeNode[] } {
  const extracted: TreeNode[] = [];
  const remaining: TreeNode[] = [];

  for (const node of tree) {
    if (ids.has(node.id)) {
      extracted.push(node);
    } else {
      const childResult = extractNodes(node.children ?? [], ids);
      extracted.push(...childResult.extracted);
      remaining.push({ ...node, children: childResult.remaining });
    }
  }

  return { extracted, remaining };
}

function insertNodes(
  tree: TreeNode[],
  nodes: TreeNode[],
  parentId: string | null,
  index: number
): TreeNode[] {
  if (parentId === null) {
    const result = [...tree];
    result.splice(index, 0, ...nodes);
    return result;
  }

  return tree.map((node) => {
    if (node.id === parentId) {
      const children = [...(node.children ?? [])];
      children.splice(index, 0, ...nodes);
      return { ...node, children };
    }
    if (node.children?.length) {
      return { ...node, children: insertNodes(node.children, nodes, parentId, index) };
    }
    return node;
  });
}

function findChildren(tree: TreeNode[], parentId: string): TreeNode[] | null {
  for (const node of tree) {
    if (node.id === parentId) return node.children ?? [];
    if (node.children?.length) {
      const found = findChildren(node.children, parentId);
      if (found !== null) return found;
    }
  }
  return null;
}

/** Return the direct children of parentId in tree, or the root list if parentId is null. */
function getSiblings(tree: TreeNode[], parentId: string | null): TreeNode[] {
  if (parentId === null) return tree;
  return findChildren(tree, parentId) ?? [];
}

export function useMove(restBase: string, tree: TreeNode[], setTree: SetTree) {
  // Always reflects the latest tree without being a useCallback dependency
  const treeRef = useRef(tree);
  treeRef.current = tree;

  return useCallback(
    ({ dragIds, parentId, index }: MoveArgs) => {
      const snapshot = treeRef.current;
      const idSet = new Set(dragIds);
      const parentNumericId = parentId ? parseInt(parentId, 10) : 0;

      const { extracted, remaining } = extractNodes(snapshot, idSet);
      const updated = extracted.map((node) => ({
        ...node,
        data: { ...node.data, parent: parentNumericId },
      }));
      const newTree = insertNodes(remaining, updated, parentId, index);
      const newSiblings = getSiblings(newTree, parentId);

      setTree(newTree);

      // Build a map of node id → its new index among siblings
      const orderMap = new Map(newSiblings.map((n, i) => [n.id, i]));

      Promise.all(
        dragIds.map((id) => {
          const menuOrder = orderMap.get(id) ?? index;
          return movePost(`wp/v2/${restBase}`, parseInt(id, 10), parentNumericId, menuOrder);
        })
      ).catch(() => {
        setTree(snapshot);
      });
    },
    [restBase, setTree]
  );
}
