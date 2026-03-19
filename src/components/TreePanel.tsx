import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Tree } from 'react-arborist';
import type { TreeApi, MoveHandler, CursorProps } from 'react-arborist';
import useResizeObserver from 'use-resize-observer';
import { NodeRenderer } from './NodeRenderer';
import { useTreeData } from '../hooks/useTreeData';
import { useMove } from '../hooks/useMove';
import { TreeContext } from '../context/TreeContext';
import { searchPosts } from '../api/wp';
import { htmlToText } from '../utils/treeUtils';
import type { TreeNode } from '../types';

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

  // Fetch all matching pages from the API when the search term changes
  useEffect(() => {
    if (searchTerm.trim().length < 2) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setIsSearching(true);
      searchPosts(`wp/v2/${restBase}`, searchTerm)
        .then((posts) => {
          if (cancelled) return;
          setSearchResults(posts.map((post) => ({
            id: String(post.id),
            name: htmlToText(post.title.rendered) || `(${post.slug})`,
            children: undefined, // flat list, no expand
            childrenLoaded: true,
            data: post,
          })));
        })
        .catch(() => { if (!cancelled) setSearchResults([]); })
        .finally(() => { if (!cancelled) setIsSearching(false); });
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
        <div style={{ padding: '0 4px 8px', flexShrink: 0, position: 'relative' }}>
          <input
            type="search"
            placeholder="Search all pages…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="wptv-search"
          />
          {isSearching && (
            <span
              className="spinner is-active"
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, margin: 0 }}
            />
          )}
        </div>

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
            openByDefault={false}
            renderCursor={DropCursor}
          >
            {NodeRenderer}
          </Tree>
        </div>
      </div>
    </TreeContext.Provider>
  );
}
