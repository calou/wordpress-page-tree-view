import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Tree } from 'react-arborist';
import type { TreeApi, MoveHandler, CursorProps } from 'react-arborist';
import useResizeObserver from 'use-resize-observer';
import { NodeRenderer } from './NodeRenderer';
import { useTreeData } from '../hooks/useTreeData';
import { useMove } from '../hooks/useMove';
import { TreeContext } from '../context/TreeContext';
import { searchPosts, fetchPostsByIds } from '../api/wp';
import { htmlToText } from '../utils/treeUtils';
import type { TreeNode, WPPost } from '../types';

function DropCursor({ top, left, indent }: CursorProps) {
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: left + indent,
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

interface TreePanelProps {
  restBase: string;
  hierarchical: boolean;
}

export function TreePanel({ restBase, hierarchical }: TreePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const treeApiRef = useRef<TreeApi<TreeNode>>(null);
  const { width = 800, height = 600 } = useResizeObserver({ ref: containerRef });

  const { tree, setTree, isLoading, progress, error, reload, loadChildren } =
    useTreeData(restBase, hierarchical);
  const onMove = useMove(restBase, tree, setTree);

  const [actionNodeId, setActionNodeId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<TreeNode[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const canEditAll = window.wptvConfig?.canEditAll ?? false;

  const clearSearch = useCallback(() => setSearchTerm(''), []);

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
        const base = `wp/v2/${restBase}`;

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
  }, [searchTerm, restBase]);

  if (isLoading) {
    const label = progress
      ? `Loading ${progress.loaded.toLocaleString()} / ${progress.total.toLocaleString()}…`
      : 'Loading…';
    const pct =
      progress && progress.total > 0
        ? Math.round((progress.loaded / progress.total) * 100)
        : 0;
    return (
      <div style={{ padding: 24, color: '#787c82' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span className="spinner is-active" style={{ float: 'none', margin: 0 }} />
          <span>{label}</span>
        </div>
        {progress && (
          <div style={{ width: 240, height: 4, background: '#ddd', borderRadius: 2 }}>
            <div
              style={{
                width: `${pct}%`,
                height: '100%',
                background: '#2271b1',
                borderRadius: 2,
                transition: 'width 0.2s',
              }}
            />
          </div>
        )}
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
    if (!hierarchical && parentId !== null) return;
    onMove({ dragIds, parentId, index });
  };

  const handleToggle = (id: string) => {
    if (searchResults !== null) return; // no lazy-load during search
    const node = treeApiRef.current?.get(id);
    if (node?.isOpen && !node.data.childrenLoaded) {
      loadChildren(id);
    }
  };

  const isInSearch = searchResults !== null;

  return (
    <TreeContext.Provider value={{ restBase, setTree, treeApiRef, actionNodeId, setActionNodeId, canEditAll, clearSearch }}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ padding: '0 4px 8px', flexShrink: 0 }}>
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

        <div ref={containerRef} style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <Tree<TreeNode>
            ref={treeApiRef}
            data={isInSearch ? searchResults! : tree}
            onMove={canEditAll && !isInSearch ? handleMove : undefined}
            disableDrag={!canEditAll || isInSearch}
            disableDrop={!canEditAll || isInSearch}
            onToggle={handleToggle}
            width={width}
            height={height}
            rowHeight={38}
            indent={20}
            overscanCount={10}
            openByDefault={isInSearch}
            renderCursor={DropCursor}
          >
            {NodeRenderer}
          </Tree>
        </div>
      </div>
    </TreeContext.Provider>
  );
}
