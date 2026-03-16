import React, { useRef } from 'react';
import { Tree } from 'react-arborist';
import useResizeObserver from 'use-resize-observer';
import { NodeRenderer } from './NodeRenderer';
import { useTreeData } from '../hooks/useTreeData';
import { useMove } from '../hooks/useMove';
import type { MoveHandler } from 'react-arborist';
import type { TreeNode } from '../types';

interface TreePanelProps {
  restBase: string;
  hierarchical: boolean;
}

export function TreePanel({ restBase, hierarchical }: TreePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { width = 800, height = 600 } = useResizeObserver({ ref: containerRef });

  const { tree, setTree, isLoading, error, reload } = useTreeData(restBase);
  const onMove = useMove(restBase, setTree);

  if (isLoading) {
    return (
      <div style={{ padding: 24, color: '#787c82' }}>
        <span className="spinner is-active" style={{ float: 'none', margin: '0 8px 0 0' }} />
        Loading…
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
    // Prevent dropping into non-hierarchical types
    if (!hierarchical && parentId !== null) return;
    onMove({ dragIds, parentId, index });
  };

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}
    >
      <Tree<TreeNode>
        data={tree}
        onMove={handleMove}
        width={width}
        height={height}
        rowHeight={32}
        indent={20}
        overscanCount={10}
        openByDefault={false}
      >
        {NodeRenderer}
      </Tree>
    </div>
  );
}
