import { useState, useEffect, useCallback } from 'react';
import { fetchAllPosts, fetchChildren } from '../api/wp';
import type { WPPost, TreeNode } from '../types';

function toNode(post: WPPost): TreeNode {
  return {
    id: String(post.id),
    name: post.title.rendered || `(${post.slug})`,
    children: [],        // [] = expandable, children not yet fetched
    childrenLoaded: false,
    data: post,
  };
}

/** Flat array → tree (used for non-hierarchical post types only). */
function buildTree(posts: WPPost[]): TreeNode[] {
  const nodeMap = new Map<number, TreeNode>();

  for (const post of posts) {
    nodeMap.set(post.id, {
      id: String(post.id),
      name: post.title.rendered || `(${post.slug})`,
      children: undefined, // flat types have no hierarchy
      childrenLoaded: true,
      data: post,
    });
  }

  const roots: TreeNode[] = [];
  for (const post of posts) {
    const node = nodeMap.get(post.id)!;
    if (post.parent && nodeMap.has(post.parent)) {
      nodeMap.get(post.parent)!.children = [
        ...(nodeMap.get(post.parent)!.children ?? []),
        node,
      ];
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function updateNode(
  tree: TreeNode[],
  id: string,
  updater: (n: TreeNode) => TreeNode
): TreeNode[] {
  return tree.map((node) => {
    if (node.id === id) return updater(node);
    if (node.children?.length) {
      return { ...node, children: updateNode(node.children, id, updater) };
    }
    return node;
  });
}

interface Progress { loaded: number; total: number }

interface UseTreeDataResult {
  tree: TreeNode[];
  setTree: React.Dispatch<React.SetStateAction<TreeNode[]>>;
  isLoading: boolean;
  progress: Progress | null;
  error: string | null;
  reload: () => void;
  loadChildren: (nodeId: string) => Promise<void>;
}

export function useTreeData(restBase: string, hierarchical: boolean): UseTreeDataResult {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!restBase) return;

    let cancelled = false;
    setIsLoading(true);
    setProgress(null);
    setError(null);

    const load = hierarchical
      // Hierarchical: load only top-level pages (parent=0) up front
      ? fetchAllPosts(
          `wp/v2/${restBase}`,
          undefined,
          (loaded, total) => { if (!cancelled) setProgress({ loaded, total }); },
          0
        ).then((posts) => posts.map(toNode))
      // Flat: load everything and build the full tree at once
      : fetchAllPosts(
          `wp/v2/${restBase}`,
          undefined,
          (loaded, total) => { if (!cancelled) setProgress({ loaded, total }); }
        ).then(buildTree);

    load
      .then((nodes) => { if (!cancelled) setTree(nodes); })
      .catch((err: Error) => { if (!cancelled) setError(err.message ?? 'Failed to load'); })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, [restBase, hierarchical, reloadKey]);

  const loadChildren = useCallback(
    async (nodeId: string) => {
      // Mark node as loading
      setTree((prev) =>
        updateNode(prev, nodeId, (n) => ({ ...n, isLoadingChildren: true }))
      );

      try {
        const posts = await fetchChildren(
          `wp/v2/${restBase}`,
          parseInt(nodeId, 10)
        );

        setTree((prev) =>
          updateNode(prev, nodeId, (n) => ({
            ...n,
            isLoadingChildren: false,
            childrenLoaded: true,
            // undefined = confirmed leaf; [] would keep toggle but stay empty
            children: posts.length > 0 ? posts.map(toNode) : undefined,
          }))
        );
      } catch {
        // On error, revert loading state so user can retry by collapsing/expanding
        setTree((prev) =>
          updateNode(prev, nodeId, (n) => ({ ...n, isLoadingChildren: false }))
        );
      }
    },
    [restBase]
  );

  return { tree, setTree, isLoading, progress, error, reload, loadChildren };
}
