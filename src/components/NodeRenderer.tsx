import React from 'react';
import type { NodeRendererProps } from 'react-arborist';
import type { TreeNode } from '../types';

const STATUS_COLORS: Record<string, string> = {
  publish: '#00a32a',
  draft: '#dba617',
  private: '#3858e9',
  pending: '#996800',
  trash: '#d63638',
};

export function NodeRenderer({ node, style, dragHandle }: NodeRendererProps<TreeNode>) {
  // node.data is TreeNode; the WPPost lives at node.data.data
  const post = node.data.data;
  const adminUrl = window.wptvConfig?.adminUrl ?? '';
  const editUrl = `${adminUrl}post.php?post=${post.id}&action=edit`;

  const statusColor = STATUS_COLORS[post.status] ?? '#787c82';

  return (
    <div
      ref={dragHandle}
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        paddingRight: 8,
        cursor: 'pointer',
        borderRadius: 3,
        background: node.isSelected ? '#e7f0fd' : 'transparent',
      }}
      onClick={() => node.toggle()}
      className="wptv-node"
    >
      {/* Expand/collapse toggle / loading spinner */}
      <span
        style={{
          display: 'inline-flex',
          width: 16,
          flexShrink: 0,
          color: '#787c82',
          fontSize: 13,
          justifyContent: 'center',
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

      {/* Page icon */}
      <span
        className="dashicons dashicons-admin-page"
        style={{ fontSize: 18, color: '#787c82', flexShrink: 0 }}
      />

      {/* Title */}
      <span
        style={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: 15,
        }}
        title={post.title.rendered}
        dangerouslySetInnerHTML={{ __html: post.title.rendered || `(${post.slug})` }}
      />

      {/* Status badge */}
      {post.status !== 'publish' && (
        <span
          style={{
            fontSize: 10,
            padding: '1px 5px',
            borderRadius: 3,
            background: statusColor + '22',
            color: statusColor,
            border: `1px solid ${statusColor}55`,
            flexShrink: 0,
            textTransform: 'uppercase',
            fontWeight: 600,
            letterSpacing: '0.05em',
          }}
        >
          {post.status}
        </span>
      )}

      {/* Quick actions (shown on hover via CSS) */}
      <span className="wptv-node-actions">
        <a
          href={editUrl}
          onClick={(e) => e.stopPropagation()}
          style={{ fontSize: 11, color: '#2271b1', textDecoration: 'none' }}
          title="Edit"
        >
          Edit
        </a>
        {post.status === 'publish' && (
          <>
            <span style={{ color: '#ccc', margin: '0 3px' }}>|</span>
            <a
              href={post.link}
              onClick={(e) => e.stopPropagation()}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 11, color: '#2271b1', textDecoration: 'none' }}
              title="View"
            >
              View
            </a>
          </>
        )}
      </span>
    </div>
  );
}
