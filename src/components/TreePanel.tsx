import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { CursorProps, MoveHandler, TreeApi } from 'react-arborist';
import { Tree } from 'react-arborist';
import useResizeObserver from 'use-resize-observer';
import { createPage, fetchPostsByIds, getPage, searchPosts } from '../api/wp';
import { TreeContext } from '../context/TreeContext';
import { useMove } from '../hooks/useMove';
import { useTreeData } from '../hooks/useTreeData';
import type { TreeNode, WPPost } from '../types';
import { htmlToText } from '../utils/treeUtils';
import { NodeRenderer } from './NodeRenderer';

function DropCursor({ top, left, indent }: CursorProps) {
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: left + indent - 12,
        right: 0,
        height: 2,
        background: '#2271b1',
        borderRadius: 1,
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: -4,
          top: -3,
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: '#2271b1',
        }}
      />
    </div>
  );
}


export function TreePanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const treeApiRef = useRef<TreeApi<TreeNode>>(null);
  const { width = 800, height = 600 } = useResizeObserver({ ref: containerRef });

  const { tree, setTree, isLoading, error, homePageId, reload, loadChildren } =
    useTreeData();
  const onMove = useMove(tree, setTree);

  const [actionNodeId, setActionNodeId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<TreeNode[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const canEditAll = window.wptvConfig?.canEditAll ?? false;

  const storageKey = 'wptv_open_pages';
  const openIdsRef = useRef<Set<string>>(new Set());
  const [pendingRestoreIds, setPendingRestoreIds] = useState<Set<string>>(() => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const ids = new Set<string>(JSON.parse(stored));
        openIdsRef.current = new Set(ids);
        return ids;
      }
    } catch { }
    return new Set<string>();
  });

  const clearSearch = useCallback(() => setSearchTerm(''), []);


  const handleNewPage = async (e: React.ChangeEvent) => {
    setIsCreating(true);
    let parent = !!actionNodeId ? +actionNodeId : 0
    let menu_order = 0;
    const value = e.target.value;
    if (parent !== 0 && value !== 'inside') {
      const page = await getPage(parent);
      switch (value) {
        case 'before':
          parent = page.parent;
          menu_order = page.menu_order - 1;
          break;
        case 'after':
          parent = page.parent;
          menu_order = page.menu_order + 1;
          break;

      }
    }

    const newPost = await createPage({ parent, menu_order });
    window.open(`${window.wptvConfig?.adminUrl ?? ''}post.php?post=${newPost.id}&action=edit`, '_blank');
    setIsCreating(false);
  }

  // Fetch matching pages + their full ancestor chains, then build a tree from them
  useEffect(() => {
    if (searchTerm.trim().length < 2) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        const base = 'wp/v2/pages';

        // Step 1: get matching posts
        const matches = await searchPosts(base, searchTerm);
        if (cancelled) return;

        if (matches.length === 0) {
          setSearchResults([]);
          return;
        }

        // Step 2: iteratively fetch ancestors until all parent IDs are resolved
        const collected = new Map<number, WPPost>();
        for (const p of matches) collected.set(p.id, p);

        let toFetch = new Set(matches.filter(p => p.parent && !collected.has(p.parent)).map(p => p.parent));
        while (toFetch.size > 0) {
          const ancestors = await fetchPostsByIds(base, [...toFetch]);
          if (cancelled) return;
          toFetch = new Set();
          for (const p of ancestors) {
            collected.set(p.id, p);
            if (p.parent && !collected.has(p.parent)) toFetch.add(p.parent);
          }
        }

        // Step 3: build a tree from the collected posts
        const nodeMap = new Map<number, TreeNode>();
        for (const post of collected.values()) {
          nodeMap.set(post.id, {
            id: String(post.id),
            name: htmlToText(post.title.rendered) || `(${post.slug})`,
            children: [],
            childrenLoaded: true,
            data: post,
          });
        }

        const roots: TreeNode[] = [];
        for (const post of collected.values()) {
          const node = nodeMap.get(post.id)!;
          if (post.parent && nodeMap.has(post.parent)) {
            nodeMap.get(post.parent)!.children!.push(node);
          } else {
            roots.push(node);
          }
        }

        // Sort children and mark true leaves (no children in this subtree)
        for (const node of nodeMap.values()) {
          if (node.children!.length === 0) {
            node.children = undefined;
          } else {
            node.children!.sort((a, b) => a.data.menu_order - b.data.menu_order);
          }
        }
        roots.sort((a, b) => a.data.menu_order - b.data.menu_order);

        if (!cancelled) setSearchResults(roots);
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchTerm]);

  // Restore open nodes from sessionStorage after tree data loads or new children arrive
  useEffect(() => {
    if (isLoading || !pendingRestoreIds.size || searchResults !== null) return;

    const toOpen: string[] = [];
    const visit = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (pendingRestoreIds.has(node.id)) toOpen.push(node.id);
        if (node.children?.length) visit(node.children);
      }
    };
    visit(tree);

    if (toOpen.length === 0) return;

    for (const id of toOpen) {
      treeApiRef.current?.open(id);
    }
    setPendingRestoreIds((prev: Set<string>) => {
      const next = new Set(prev);
      for (const id of toOpen) next.delete(id);
      return next;
    });
  }, [tree, isLoading, pendingRestoreIds, searchResults]);

  if (isLoading) {
    return (
      <div style={{ padding: 24, color: '#787c82' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span className="spinner is-active" style={{ float: 'none', margin: 0 }} />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <div className="notice notice-error inline">
          <p>
            Failed to load content: {error}{' '}
            <button className="button button-secondary" onClick={reload}>
              Retry
            </button>
          </p>
        </div>
      </div>
    );
  }

  const handleMove: MoveHandler<TreeNode> = ({ dragIds, parentId, index }) => {
    onMove({ dragIds, parentId, index });
  };

  const handleToggle = (id: string) => {
    if (searchResults !== null) return; // no lazy-load during search
    const node = treeApiRef.current?.get(id);
    if (node?.isOpen && !node.data.childrenLoaded) {
      loadChildren(id);
    }
    if (node) {
      if (node.isOpen) {
        openIdsRef.current.add(id);
      } else {
        openIdsRef.current.delete(id);
      }
      try {
        sessionStorage.setItem(storageKey, JSON.stringify([...openIdsRef.current]));
      } catch { }
    }
  };

  const isInSearch = searchResults !== null;

  return (
    <TreeContext.Provider value={{ homePageId, setTree, treeApiRef, actionNodeId, setActionNodeId, canEditAll, clearSearch }}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ display: 'flex', gap: '8px', padding: '0 4px 8px', flexShrink: 0 }}>
          <select onChange={handleNewPage} disabled={isCreating} >
            <option disabled selected>New page...</option>
            <option value="inside">New page inside</option>
            <option value="before">New page before</option>
            <option value="after">New page after</option>
          </select>

          <input
            type="search"
            placeholder="Search all pages…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="wptv-search"
          />
        </div>

        {isSearching && (
          <div style={{ padding: '8px 4px', color: '#787c82', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="spinner is-active" style={{ width: 12, height: 12, margin: 0, flexShrink: 0 }} />
            Searching…
          </div>
        )}

        {isInSearch && searchResults!.length === 0 && !isSearching && (
          <div style={{ padding: '8px 4px', color: '#787c82', fontSize: 13 }}>
            No pages found.
          </div>
        )}

        <div ref={containerRef} style={{ flex: 1, overflow: 'hidden', minHeight: 0, margin: "4px", padding: "12px", backgroundColor: "#FFF", borderRadius: "12px" }}>
          <Tree<TreeNode>
            ref={treeApiRef}
            data={isInSearch ? searchResults! : tree}
            onMove={canEditAll && !isInSearch ? handleMove : undefined}
            disableDrag={!canEditAll || isInSearch}
            disableDrop={!canEditAll || isInSearch}
            onToggle={handleToggle}
            width={width}
            height={height}
            rowHeight={32}
            indent={24}
            overscanCount={1}
            openByDefault={isInSearch}
            renderCursor={DropCursor}
          >
            {NodeRenderer}
          </Tree>
        </div>
      </div>
    </TreeContext.Provider >
  );
}
