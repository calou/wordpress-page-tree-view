import { useState, useEffect, useCallback } from 'react';
import { fetchAllPosts } from '../api/wp';
import type { WPPost, TreeNode } from '../types';

function buildTree(posts: WPPost[]): TreeNode[] {
  const nodeMap = new Map<number, TreeNode>();

  // First pass: create all nodes
  for (const post of posts) {
    nodeMap.set(post.id, {
      id: String(post.id),
      name: post.title.rendered || `(${post.slug})`,
      children: [],
      data: post,
    });
  }

  const roots: TreeNode[] = [];

  // Second pass: assign children to parents
  for (const post of posts) {
    const node = nodeMap.get(post.id)!;
    if (post.parent && nodeMap.has(post.parent)) {
      nodeMap.get(post.parent)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

interface UseTreeDataResult {
  tree: TreeNode[];
  setTree: React.Dispatch<React.SetStateAction<TreeNode[]>>;
  isLoading: boolean;
  error: string | null;
  reload: () => void;
}

export function useTreeData(restBase: string): UseTreeDataResult {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!restBase) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchAllPosts(`wp/v2/${restBase}`)
      .then((posts) => {
        if (cancelled) return;
        setTree(buildTree(posts));
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message ?? 'Failed to load posts');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [restBase, reloadKey]);

  return { tree, setTree, isLoading, error, reload };
}
