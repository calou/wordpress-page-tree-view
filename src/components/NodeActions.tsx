import React, { useState } from 'react';
import { bulkUpdateStatus, createPost, duplicatePost, duplicateSubtree, exportSubtree, restorePost, trashPost } from '../api/wp';
import { useTreeContext } from '../context/TreeContext';
import type { TreeNode, WPPost, NodeActionsProps } from '../types';
import {
  addChildToNode,
  addSiblingAfter,
  addSiblingBefore,
  htmlToText,
  updateNodeInTree,
  updateSubtreeInTree,
} from '../utils/treeUtils';

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

export function NodeActions({ post, nodeId, active }: NodeActionsProps) {
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

  const handleAdd = (e: React.MouseEvent, parent: number, menu_order: number): void => {
    stop(e);
    run(async () => {
      const newPost = await createPost(`wp/v2/${restBase}`, {
        parent: post.id,
        menu_order: 0,
      });
      setTree((prev) => addChildToNode(prev, nodeId, toCreatedNode(newPost)));
      treeApiRef.current?.open(nodeId);
      window.open(`${adminUrl}post.php?post=${newPost.id}&action=edit`, '_blank');
      setActionNodeId(null);
    });

  };

  const handleAddInside = (e: React.MouseEvent) => {
    stop(e);
    run(async () => {
      const newPost = await createPost(`wp/v2/${restBase}`, {
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
        parent: post.parent,
        menu_order: post.menu_order + 1,
      });
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
        {sep}
        <button style={{ ...base, color: '#00a32a' }} onMouseDown={stop} onClick={handleRestoreAll}>Restore</button>
      </span>
    );
  }

  return (
    <span className='wptv-node-actions'
      style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}
      onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
      onClick={(e) => e.stopPropagation()}
    >
      <a
        href={`${adminUrl}post.php?post=${post.id}&action=edit`}
        style={base}
        onMouseDown={stop}
        onClick={(e) => { e.stopPropagation(); setActionNodeId(null); }}
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
            onClick={(e) => { e.stopPropagation(); setActionNodeId(null); }}
          >
            View
          </a>
        </>
      )}
      {!!active && (
        <>
          {sep}
          < button style={base} onMouseDown={stop} onClick={handleAddInside}>+Inside</button>
          {sep}
          <button style={base} onMouseDown={stop} onClick={handleAddBefore}>+Before</button>
          {sep}
          <button style={base} onMouseDown={stop} onClick={handleAddAfter}>+After</button>
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
    </span >
  );
}
