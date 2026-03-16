import { useCallback } from 'react';
import { movePost } from '../api/wp';
import type { TreeNode } from '../types';

interface MoveArgs {
  dragIds: string[];
  parentId: string | null;
  index: number;
}

type SetTree = React.Dispatch<React.SetStateAction<TreeNode[]>>;

/**
 * Remove nodes with the given ids from the tree, returning them and the modified tree.
 */
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

/**
 * Insert nodes into the tree at the specified parent and index.
 */
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
      return {
        ...node,
        children: insertNodes(node.children, nodes, parentId, index),
      };
    }
    return node;
  });
}

export function useMove(restBase: string, setTree: SetTree) {
  return useCallback(
    ({ dragIds, parentId, index }: MoveArgs) => {
      const idSet = new Set(dragIds);
      let snapshot: TreeNode[] = [];

      setTree((prev) => {
        snapshot = prev;
        const { extracted, remaining } = extractNodes(prev, idSet);
        const updated = extracted.map((node) => ({
          ...node,
          data: {
            ...node.data,
            parent: parentId ? parseInt(parentId, 10) : 0,
          },
        }));
        return insertNodes(remaining, updated, parentId, index);
      });

      const parentNumericId = parentId ? parseInt(parentId, 10) : 0;

      Promise.all(
        dragIds.map((id, i) =>
          movePost(`wp/v2/${restBase}`, parseInt(id, 10), parentNumericId, index + i)
        )
      ).catch(() => {
        // Roll back on error
        setTree(snapshot);
      });
    },
    [restBase, setTree]
  );
}
