import React, { useCallback } from 'react';
import type { NodeRendererProps } from 'react-arborist';
import { useTreeContext } from '../context/TreeContext';
import type { TreeNode } from '../types';
import { NodeActions } from './NodeActions';

const STATUS_ICONS: Record<string, { icon: string; color: string }> = {
  publish: { icon: 'dashicons-admin-page', color: '#787c82' },
  draft: { icon: 'dashicons-edit', color: '#dba617' },
  private: { icon: 'dashicons-lock', color: '#3858e9' },
  pending: { icon: 'dashicons-clock', color: '#996800' },
  future: { icon: 'dashicons-calendar-alt', color: '#2271b1' },
  trash: { icon: 'dashicons-trash', color: '#d63638' },
};


export function NodeRenderer({ node, style, dragHandle }: NodeRendererProps<TreeNode>) {
  const post = node.data.data;

  const statusIcon = STATUS_ICONS[post.status] ?? STATUS_ICONS.publish;

  const { homePageId, actionNodeId, setActionNodeId, canEditAll } = useTreeContext();
  const isActive = actionNodeId === node.id;

  const background = node.willReceiveDrop
    ? '#dbeafe'
    : isActive
      ? '#e7f0fd'
      : 'transparent';

  const outline = node.willReceiveDrop ? '2px solid #2271b1' : 'none';

  const handleRowClick = useCallback(
    (_: React.MouseEvent) => {
      setActionNodeId(isActive ? null : node.id);
    },
    [isActive, node.id, setActionNodeId]
  );

  return (
    <div
      ref={canEditAll ? dragHandle : null}
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        paddingTop: '8px',
        paddingBottom: '8px',
        marginBottom: '4px',
        cursor: 'pointer',
        borderRadius: 3,
        background,
        outline,
        outlineOffset: '-2px',
      }}
      onClick={handleRowClick}
      className="wptv-node"
    >
      {/* Expand/collapse toggle */}
      <span
        style={{
          display: 'inline-flex',
          width: 16,
          flexShrink: 0,
          color: '#AAA',
          fontSize: 24,
          justifyContent: 'center',
          marginLeft: '8px',
        }}
        onClick={(e) => {
          e.stopPropagation();
          node.toggle();
        }}
      >
        {node.data.isLoadingChildren ? (
          <span className="spinner is-active" style={{ width: 10, height: 10, margin: 0 }} />
        ) : (
          !node.isLeaf ? (node.isOpen ? '▾' : '▸') : ''
        )}
      </span>

      {/* Page icon (reflects status) */}
      <span className={`dashicons ${statusIcon.icon}`} style={{ fontSize: 18, color: statusIcon.color, flexShrink: 0 }} />

      {/* Title + inline actions */}
      <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: 18,
          }}
          title={node.data.name}
        >
          {node.data.name}
          {+node.data.id === homePageId ? (<small><i>&nbsp;-&nbsp;Front page</i></small>) : ''}
        </span>
        <NodeActions post={post} nodeId={node.id} active={isActive} editable={canEditAll} />
      </span>
    </div>
  );
}
