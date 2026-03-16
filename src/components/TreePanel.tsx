import React, { useRef } from 'react';
import { Tree } from 'react-arborist';
import type { TreeApi, MoveHandler } from 'react-arborist';
import useResizeObserver from 'use-resize-observer';
import { NodeRenderer } from './NodeRenderer';
import { useTreeData } from '../hooks/useTreeData';
import { useMove } from '../hooks/useMove';
import type { TreeNode } from '../types';

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
  const onMove = useMove(restBase, setTree);

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
    const node = treeApiRef.current?.get(id);
    // Load children only when opening a node whose children haven't been fetched yet
    if (node?.isOpen && !node.data.childrenLoaded) {
      loadChildren(id);
    }
  };

  return (
    <div ref={containerRef} style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
      <Tree<TreeNode>
        ref={treeApiRef}
        data={tree}
        onMove={handleMove}
        onToggle={handleToggle}
        width={width}
        height={height}
        rowHeight={38}
        indent={20}
        overscanCount={10}
        openByDefault={false}
      >
        {NodeRenderer}
      </Tree>
    </div>
  );
}
