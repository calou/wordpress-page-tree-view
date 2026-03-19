import React, { useState, useCallback } from 'react';
import type { NodeRendererProps } from 'react-arborist';
import type { TreeNode, WPPost } from '../types';
import { useTreeContext } from '../context/TreeContext';
import { createPost, trashWithDescendants } from '../api/wp';
import {
  addChildToNode,
  addSiblingBefore,
  addSiblingAfter,
  removeNodeFromTree,
} from '../utils/treeUtils';

const STATUS_COLORS: Record<string, string> = {
  publish: '#00a32a',
  draft: '#dba617',
  private: '#3858e9',
  pending: '#996800',
  trash: '#d63638',
};

function toNode(post: WPPost): TreeNode {
  return {
    id: String(post.id),
    name: post.title.rendered || `(${post.slug})`,
    children: undefined,
    childrenLoaded: true,
    data: post,
  };
}

interface NodeActionsProps {
  post: WPPost;
  nodeId: string;
}

function NodeActions({ post, nodeId }: NodeActionsProps) {
  const { restBase, setTree, treeApiRef, setActionNodeId } = useTreeContext();
  const adminUrl = window.wptvConfig?.adminUrl ?? '';
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const stop = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  const handleAddInside = (e: React.MouseEvent) => {
    stop(e);
    run(async () => {
      const newPost = await createPost(`wp/v2/${restBase}`, {
        title: 'Untitled',
        parent: post.id,
        menu_order: 0,
      });
      setTree((prev) => addChildToNode(prev, nodeId, toNode(newPost)));
      treeApiRef.current?.open(nodeId);
      window.open(`${adminUrl}post.php?post=${newPost.id}&action=edit`, '_blank');
      setActionNodeId(null);
    });
  };

  const handleAddBefore = (e: React.MouseEvent) => {
    stop(e);
    run(async () => {
      const newPost = await createPost(`wp/v2/${restBase}`, {
        title: 'Untitled',
        parent: post.parent,
        menu_order: post.menu_order,
      });
      setTree((prev) => addSiblingBefore(prev, nodeId, toNode(newPost)));
      window.open(`${adminUrl}post.php?post=${newPost.id}&action=edit`, '_blank');
      setActionNodeId(null);
    });
  };

  const handleAddAfter = (e: React.MouseEvent) => {
    stop(e);
    run(async () => {
      const newPost = await createPost(`wp/v2/${restBase}`, {
        title: 'Untitled',
        parent: post.parent,
        menu_order: post.menu_order + 1,
      });
      setTree((prev) => addSiblingAfter(prev, nodeId, toNode(newPost)));
      window.open(`${adminUrl}post.php?post=${newPost.id}&action=edit`, '_blank');
      setActionNodeId(null);
    });
  };

  const handleTrash = (e: React.MouseEvent) => {
    stop(e);
    run(async () => {
      if (
        !window.confirm(
          `Move "${post.title.rendered || post.slug}" and all its descendants to trash?`
        )
      )
        return;
      await trashWithDescendants(`wp/v2/${restBase}`, post.id);
      setTree((prev) => removeNodeFromTree(prev, nodeId));
      setActionNodeId(null);
    });
  };

  const sep = <span style={{ color: '#ddd', userSelect: 'none' }}>|</span>;

  const base: React.CSSProperties = {
    fontSize: 15,
    color: '#2271b1',
    textDecoration: 'none',
    background: 'none',
    border: 'none',
    padding: '0 2px',
    cursor: 'pointer',
    opacity: busy ? 0.5 : 1,
    pointerEvents: busy ? 'none' : 'auto',
    flexShrink: 0,
  };

  return (
    <span
      style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}
      onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
      onClick={(e) => e.stopPropagation()}
    >
      <button style={base} onMouseDown={stop} onClick={handleAddInside}>+Inside</button>
      {sep}
      <button style={base} onMouseDown={stop} onClick={handleAddBefore}>+Before</button>
      {sep}
      <button style={base} onMouseDown={stop} onClick={handleAddAfter}>+After</button>
      {sep}
      <a
        href={`${adminUrl}post.php?post=${post.id}&action=edit`}
        style={base}
        onMouseDown={stop}
        onClick={(e) => { stop(e); setActionNodeId(null); }}
      >
        Edit
      </a>
      {post.status === 'publish' && (
        <>
          {sep}
          <a
            href={post.link}
            target="_blank"
            rel="noreferrer"
            style={base}
            onMouseDown={stop}
            onClick={(e) => { stop(e); setActionNodeId(null); }}
          >
            View
          </a>
        </>
      )}
      {sep}
      <button
        style={{ ...base, color: '#d63638' }}
        onMouseDown={stop}
        onClick={handleTrash}
      >
        Trash
      </button>
    </span>
  );
}

export function NodeRenderer({ node, style, dragHandle }: NodeRendererProps<TreeNode>) {
  const post = node.data.data;
  const adminUrl = window.wptvConfig?.adminUrl ?? '';
  const editUrl = `${adminUrl}post.php?post=${post.id}&action=edit`;
  const statusColor = STATUS_COLORS[post.status] ?? '#787c82';

  const { actionNodeId, setActionNodeId } = useTreeContext();
  const isActive = actionNodeId === node.id;

  const background = node.willReceiveDrop
    ? '#dbeafe'
    : isActive
      ? '#e7f0fd'
      : 'transparent';

  const outline = node.willReceiveDrop ? '2px solid #2271b1' : 'none';

  const handleRowClick = useCallback(
    (e: React.MouseEvent) => {
      setActionNodeId(isActive ? null : node.id);
      node.toggle();
    },
    [isActive, node, setActionNodeId]
  );

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

      {/* Title + inline actions */}
      <span style={{ flex: 0, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: 15,
          }}
          title={post.title.rendered}
          dangerouslySetInnerHTML={{ __html: post.title.rendered || `(${post.slug})` }}
        />

        {/* Actions: full set when active, hover-only Edit/View otherwise */}
        {isActive ? (
          <NodeActions post={post} nodeId={node.id} />
        ) : (
          <span className="wptv-node-actions">
            <a
              href={editUrl}
              onClick={(e) => e.stopPropagation()}
              style={{ fontSize: 15, color: '#2271b1', textDecoration: 'none' }}
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
                  style={{ fontSize: 15, color: '#2271b1', textDecoration: 'none' }}
                >
                  View
                </a>
              </>
            )}
          </span>
        )}
      </span>

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
    </div>
  );
}
