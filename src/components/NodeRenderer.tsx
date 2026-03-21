import React, { useState, useCallback } from 'react';
import type { NodeRendererProps } from 'react-arborist';
import type { TreeNode, WPPost } from '../types';
import { useTreeContext } from '../context/TreeContext';
import { createPost, duplicatePost, duplicateSubtree, trashPost, restorePost, bulkUpdateStatus } from '../api/wp';
import {
  addChildToNode,
  addSiblingBefore,
  addSiblingAfter,
  updateNodeInTree,
  updateSubtreeInTree,
  htmlToText,
} from '../utils/treeUtils';

const STATUS_ICONS: Record<string, { icon: string; color: string }> = {
  publish: { icon: 'dashicons-admin-page', color: '#787c82' },
  draft: { icon: 'dashicons-edit', color: '#dba617' },
  private: { icon: 'dashicons-lock', color: '#3858e9' },
  pending: { icon: 'dashicons-clock', color: '#996800' },
  future: { icon: 'dashicons-calendar-alt', color: '#2271b1' },
  trash: { icon: 'dashicons-trash', color: '#d63638' },
};

function toCreatedNode(post: WPPost): TreeNode {
  return {
    id: String(post.id),
    name: htmlToText(post.title.rendered) || `(${post.slug})`,
    children: undefined,
    childrenLoaded: true,
    data: post,
  };
}

function buildSubtreeNodes(posts: import('../types').WPPost[], parentId: number): TreeNode[] {
  return posts
    .filter((p) => p.parent === parentId)
    .sort((a, b) => a.menu_order - b.menu_order)
    .map((p) => ({
      id: String(p.id),
      name: htmlToText(p.title.rendered) || `(${p.slug})`,
      children: buildSubtreeNodes(posts, p.id),
      childrenLoaded: true,
      data: p,
    }));
}

interface NodeActionsProps {
  post: WPPost;
  nodeId: string;
}

function NodeActions({ post, nodeId }: NodeActionsProps) {
  const { restBase, setTree, treeApiRef, setActionNodeId, clearSearch } = useTreeContext();
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
      setTree((prev) => addChildToNode(prev, nodeId, toCreatedNode(newPost)));
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
      setTree((prev) => addSiblingBefore(prev, nodeId, toCreatedNode(newPost)));
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
      setTree((prev) => addSiblingAfter(prev, nodeId, toCreatedNode(newPost)));
      window.open(`${adminUrl}post.php?post=${newPost.id}&action=edit`, '_blank');
      setActionNodeId(null);
    });
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    stop(e);
    run(async () => {
      const newPost = await duplicatePost(`wp/v2/${restBase}`, post);
      setTree((prev) => addSiblingAfter(prev, nodeId, toCreatedNode(newPost)));
      window.open(`${adminUrl}post.php?post=${newPost.id}&action=edit`, '_blank');
      setActionNodeId(null);
    });
  };

  const handleDuplicateAll = (e: React.MouseEvent) => {
    stop(e);
    run(async () => {
      const { root_id, posts } = await duplicateSubtree(post.id);
      const rootPost = posts.find((p) => p.id === root_id)!;
      const rootNode: TreeNode = {
        id: String(rootPost.id),
        name: htmlToText(rootPost.title.rendered) || `(${rootPost.slug})`,
        children: buildSubtreeNodes(posts, rootPost.id),
        childrenLoaded: true,
        data: rootPost,
      };
      setTree((prev) => addSiblingAfter(prev, nodeId, rootNode));
      setActionNodeId(null);
    });
  };

  const handleTrash = (e: React.MouseEvent) => {
    stop(e);
    run(async () => {
      if (!window.confirm(`Move "${post.title.rendered || post.slug}" to trash?`)) return;
      await trashPost(`wp/v2/${restBase}`, post.id);
      setTree((prev) =>
        updateNodeInTree(prev, nodeId, (n) => ({
          ...n,
          data: { ...n.data, status: 'trash' },
        }))
      );
      setActionNodeId(null);
      clearSearch();
    });
  };

  const handleTrashAll = (e: React.MouseEvent) => {
    stop(e);
    run(async () => {
      if (!window.confirm(`Move "${post.title.rendered || post.slug}" and all its descendants to trash?`)) return;
      await bulkUpdateStatus(post.id, 'trash');
      setTree((prev) =>
        updateSubtreeInTree(prev, nodeId, (n) => ({
          ...n,
          data: { ...n.data, status: 'trash' },
        }))
      );
      setActionNodeId(null);
      clearSearch();
    });
  };

  const handleRestore = (e: React.MouseEvent) => {
    stop(e);
    run(async () => {
      await restorePost(`wp/v2/${restBase}`, post.id);
      setTree((prev) =>
        updateNodeInTree(prev, nodeId, (n) => ({
          ...n,
          data: { ...n.data, status: 'draft' },
        }))
      );
      setActionNodeId(null);
      clearSearch();
    });
  };

  const handleRestoreAll = (e: React.MouseEvent) => {
    stop(e);
    run(async () => {
      if (!window.confirm(`Restore "${post.title.rendered || post.slug}" and all its descendants?`)) return;
      await bulkUpdateStatus(post.id, 'draft');
      setTree((prev) =>
        updateSubtreeInTree(prev, nodeId, (n) => ({
          ...n,
          data: { ...n.data, status: 'draft' },
        }))
      );
      setActionNodeId(null);
      clearSearch();
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

  if (post.status === 'trash') {
    return (
      <span
        style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}
        onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
        onClick={(e) => e.stopPropagation()}
      >
        <button style={{ ...base, color: '#00a32a' }} onMouseDown={stop} onClick={handleRestore}>
          Restore
        </button>
        {sep}
        <button style={{ ...base, color: '#00a32a' }} onMouseDown={stop} onClick={handleRestoreAll}>
          Restore all under
        </button>
      </span>
    );
  }

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
      <button style={base} onMouseDown={stop} onClick={handleDuplicate}>Duplicate</button>
      {sep}
      <button style={base} onMouseDown={stop} onClick={handleDuplicateAll}>Duplicate all under</button>
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
      {sep}
      <button
        style={{ ...base, color: '#d63638' }}
        onMouseDown={stop}
        onClick={handleTrashAll}
      >
        Trash all under
      </button>
    </span>
  );
}

export function NodeRenderer({ node, style, dragHandle }: NodeRendererProps<TreeNode>) {
  const post = node.data.data;
  const adminUrl = window.wptvConfig?.adminUrl ?? '';
  const editUrl = `${adminUrl}post.php?post=${post.id}&action=edit`;
  const statusIcon = STATUS_ICONS[post.status] ?? STATUS_ICONS.publish;

  const { actionNodeId, setActionNodeId, canEditAll } = useTreeContext();
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

      {/* Page icon (reflects status) */}
      <span
        className={`dashicons ${statusIcon.icon}`}
        style={{ fontSize: 18, color: statusIcon.color, flexShrink: 0 }}
      />

      {/* Title + inline actions */}
      <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: 15,
          }}
          title={node.data.name}
        >
          {node.data.name}
        </span>

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


    </div>
  );
}
