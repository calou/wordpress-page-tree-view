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

      // Compare old vs new sibling positions and update every node that moved.
      // Only updating dragIds is insufficient: inserting at position 0 sets the dragged
      // node to menu_order=0, but existing siblings already at 0 create a tie in WordPress.
      const oldSiblingIndexes = new Map(
        getSiblings(snapshot, parentId).map((n, i) => [n.id, i])
      );

      const apiCalls = newSiblings.flatMap((sibling, newIdx) => {
        const oldIdx = oldSiblingIndexes.get(sibling.id);
        // oldIdx is undefined when the node comes from a different parent — always update.
        if (oldIdx === newIdx) return [];
        return [movePost(`wp/v2/${restBase}`, parseInt(sibling.id, 10), parentNumericId, newIdx)];
      });

      Promise.all(apiCalls).catch(() => {
        setTree(snapshot);
      });
    },
    [restBase, setTree]
  );
}
