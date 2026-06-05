import { useState, useEffect, useCallback } from 'react';
import { fetchRootPages, fetchChildren } from '../api/wp';
import { htmlToText } from '../utils/treeUtils';
import type { WPPost, TreeNode } from '../types';
import apiFetch from '@wordpress/api-fetch';

function postTitle(post: WPPost): string {
  return htmlToText(post.title.rendered) || `(${post.slug})`;
}

function toNode(post: WPPost): TreeNode {
  return {
    id: String(post.id),
    name: postTitle(post),
    children: [],        // [] = expandable, children not yet fetched
    childrenLoaded: false,
    data: post,
  };
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


interface UseTreeDataResult {
  tree: TreeNode[];
  setTree: React.Dispatch<React.SetStateAction<TreeNode[]>>;
  isLoading: boolean;
  error: string | null;
  homePageId: number | null;
  reload: () => void;
  loadChildren: (nodeId: string) => Promise<void>;
}

export function useTreeData(): UseTreeDataResult {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [homePageId, setHomePageId] = useState(-1);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    apiFetch({ path: '/wp/v2/settings' }).then((settings: any) => setHomePageId(settings.page_on_front));

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchRootPages().then((posts) => posts.map(toNode))
      .then((nodes) => { if (!cancelled) setTree(nodes); })
      .catch((err: Error) => { if (!cancelled) setError(err.message ?? 'Failed to load'); })
      .finally(() => { if (!cancelled) setIsLoading(false); });



    return () => { cancelled = true; };
  }, [reloadKey]);

  const loadChildren = useCallback(async (nodeId: string) => {
    // Mark node as loading
    setTree((prev) =>
      updateNode(prev, nodeId, (n) => ({ ...n, isLoadingChildren: true }))
    );

    try {
      const posts = await fetchChildren(parseInt(nodeId, 10));

      const childNodes = posts.length > 0 ? posts.map(toNode) : undefined;

      setTree((prev) =>
        updateNode(prev, nodeId, (n) => ({
          ...n,
          isLoadingChildren: false,
          childrenLoaded: true,
          // undefined = confirmed leaf; [] would keep toggle but stay empty
          children: childNodes,
        }))
      );

      // Preemptively load grandchildren concurrently, then apply all results in one setTree
      if (childNodes) {
        Promise.allSettled(
          childNodes.map((child) =>
            fetchChildren(parseInt(child.id, 10))
              .then((posts) => ({ id: child.id, posts }))
          )
        ).then((results) => {
          const loaded = results
            .filter((r): r is PromiseFulfilledResult<{ id: string; posts: WPPost[] }> => r.status === 'fulfilled')
            .map((r) => r.value);

          if (loaded.length === 0) return;

          setTree((prev) => {
            let next = prev;
            for (const { id, posts } of loaded) {
              next = updateNode(next, id, (n) => ({
                ...n,
                childrenLoaded: true,
                children: posts.length > 0 ? posts.map(toNode) : undefined,
              }));
            }
            return next;
          });
        });
      }
    } catch {
      // On error, revert loading state so user can retry by collapsing/expanding
      setTree((prev) =>
        updateNode(prev, nodeId, (n) => ({ ...n, isLoadingChildren: false }))
      );
    }
  },
    []
  );

  return { tree, setTree, isLoading, error, reload, homePageId, loadChildren };
}
