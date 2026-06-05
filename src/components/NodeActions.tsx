import React, { useState } from 'react';
import { bulkUpdateStatus, createPost, duplicateSubtree, exportSubtree } from '../api/wp';
import { useTreeContext } from '../context/TreeContext';
import type { NodeActionsProps, TreeNode, WPPost } from '../types';
import {
  addChildToNode,
  addSiblingAfter,
  addSiblingBefore,
  htmlToText,
  updateSubtreeInTree,
} from '../utils/treeUtils';

const toCreatedNode = (post: WPPost): TreeNode => {
  return {
    id: String(post.id),
    name: htmlToText(post.title.rendered) || `(${post.slug})`,
    children: undefined,
    childrenLoaded: true,
    data: post,
  };
};

const buildSubtreeNodes = (posts: import('../types').WPPost[], parentId: number): TreeNode[] => {
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
};

const stop = (e: React.MouseEvent) => {
  e.stopPropagation();
  e.preventDefault();
};

export function NodeActions({ post, nodeId, active, editable }: NodeActionsProps) {
  const { setTree, treeApiRef, setActionNodeId, clearSearch } = useTreeContext();
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

  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActionNodeId(nodeId);
  };

  const handleAdd = (e: React.MouseEvent, parent: number, menu_order: number, callback: (prev: TreeNode[], nodeId: string, newNode: TreeNode) => TreeNode[]): void => {
    stop(e);
    run(async () => {
      const newPost = await createPost({ parent, menu_order, });
      setTree((prev) => callback(prev, nodeId, toCreatedNode(newPost)));
      treeApiRef.current?.open(nodeId);
      window.open(`${adminUrl}post.php?post=${newPost.id}&action=edit`, '_blank');
    });
  };

  const handleAddInside = (e: React.MouseEvent) => handleAdd(e, post.id, 0, addChildToNode);

  const handleAddBefore = (e: React.MouseEvent) => handleAdd(e, post.parent, post.menu_order - 1, addSiblingBefore);

  const handleAddAfter = (e: React.MouseEvent) => handleAdd(e, post.parent, post.menu_order + 1, addSiblingAfter);

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

  const handleExportAll = (e: React.MouseEvent) => {
    stop(e);
    exportSubtree(post.id);
    setActionNodeId(null);
  };

  const sep = <span style={{ color: '#ccc', userSelect: 'none' }}>|</span>;

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

  if (editable && post.status === 'trash') {
    return (
      <span
        style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}
        onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
        onClick={(e) => e.stopPropagation()}
      >
        {sep}
        <button style={{ ...base, color: '#00a32a' }} onMouseDown={stop} onClick={handleRestoreAll}>Restore</button>
      </span>
    );
  }

  return (
    <span className='wptv-node-actions'
      style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}
      onMouseDown={stop}
      onClick={(e) => e.stopPropagation()}
    >
      {sep}
      <a
        href={post.link}
        target="_blank"
        rel="noreferrer"
        style={base}
        onMouseDown={stop}
        onClick={onClick}
      >
        {post.status === 'publish' ? 'View' : 'Preview'}
      </a>
      {editable && (
        <>
          {sep}
          <a
            href={`${adminUrl}post.php?post=${post.id}&action=edit`}
            target="_blank"
            style={base}
            onMouseDown={stop}
            onClick={onClick}
          >
            Edit
          </a>

          {!!active && (
            <>
              {sep}
              < button style={base} onMouseDown={stop} onClick={handleAddInside}>New page</button>
              (
              <button style={base} onMouseDown={stop} onClick={handleAddBefore}>before</button>
              ,
              <button style={base} onMouseDown={stop} onClick={handleAddAfter}>after</button>
              )
              {sep}
              <button style={base} onMouseDown={stop} onClick={handleDuplicateAll}>Duplicate</button>
              {sep}
              <button
                style={{ ...base, color: '#d63638' }}
                onMouseDown={stop}
                onClick={handleTrashAll}
              >
                Trash
              </button>
              {
                (post.status === 'draft' || post.status === 'publish') && (
                  <>
                    {sep}
                    <button style={base} onMouseDown={stop} onClick={handleExportAll}>Export</button>
                  </>
                )
              }
            </>
          )}
        </>
      )}
    </span >
  );
}
