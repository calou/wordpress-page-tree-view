import apiFetch from '@wordpress/api-fetch';
import type { WPPost, ContentType } from '../types';

const PER_PAGE = 100;
const STATUS = 'publish,draft,private,pending,future,trash';

/**
 * Fetch all posts of a given type, paginating in parallel after the first page.
 */
export async function fetchAllPosts(
  restBase: string,
  fields = 'id,parent,menu_order,title,status,type,link,slug',
  onProgress?: (loaded: number, total: number) => void,
  parent?: number
): Promise<WPPost[]> {
  const baseQuery = `per_page=${PER_PAGE}&_fields=${fields}&orderby=menu_order&order=asc&status=${STATUS}${parent !== undefined ? `&parent=${parent}` : ''}`;

  const response = await apiFetch<WPPost[], false>({
    path: `/${restBase}?${baseQuery}&page=1`,
    parse: false,
  });

  // apiFetch with parse:false returns a Response object
  const res = response as unknown as Response;
  const totalPages = parseInt(res.headers.get('X-WP-TotalPages') ?? '1', 10);
  const total = parseInt(res.headers.get('X-WP-Total') ?? '0', 10);
  const firstPageData: WPPost[] = await res.json();

  onProgress?.(firstPageData.length, total);

  if (totalPages <= 1) {
    return firstPageData;
  }

  const remainingPages = Array.from(
    { length: totalPages - 1 },
    (_, i) => i + 2
  );

  let loaded = firstPageData.length;
  const remainingResults = await Promise.all(
    remainingPages.map(async (page) => {
      const data = await apiFetch<WPPost[]>({
        path: `/${restBase}?${baseQuery}&page=${page}`,
      });
      loaded += data.length;
      onProgress?.(loaded, total);
      return data;
    })
  );

  return [firstPageData, ...remainingResults].flat();
}

/**
 * Fetch immediate children of a single parent node.
 * Note: capped at PER_PAGE (100). Nodes with more than 100 children will be silently truncated.
 */
export async function fetchChildren(
  restBase: string,
  parentId: number,
  fields = 'id,parent,menu_order,title,status,type,link,slug'
): Promise<WPPost[]> {
  return apiFetch<WPPost[]>({
    path: `/${restBase}?per_page=${PER_PAGE}&parent=${parentId}&_fields=${fields}&orderby=menu_order&order=asc&status=${STATUS}`,
  });
}

/**
 * Fetch all registered post types from the REST API.
 */
export async function fetchPostTypes(): Promise<Record<string, ContentType>> {
  return apiFetch<Record<string, ContentType>>({
    path: '/wp/v2/types',
  });
}

/**
 * Create a new post (page, CPT, etc.).
 */
export async function createPost(
  restBase: string,
  data: { title: string; parent: number; menu_order: number; status?: string }
): Promise<WPPost> {
  return apiFetch<WPPost>({
    path: `/${restBase}`,
    method: 'POST',
    data: { status: 'draft', ...data },
  });
}

/**
 * Fetch specific posts by ID (used to resolve ancestor chains).
 */
export async function fetchPostsByIds(
  restBase: string,
  ids: number[],
  fields = 'id,parent,menu_order,title,status,type,link,slug'
): Promise<WPPost[]> {
  if (ids.length === 0) return [];
  return apiFetch<WPPost[]>({
    path: `/${restBase}?per_page=${Math.min(ids.length, PER_PAGE)}&_fields=${fields}&include=${ids.join(',')}&status=${STATUS}`,
  });
}

/**
 * Search posts by title across all statuses.
 */
export async function searchPosts(
  restBase: string,
  query: string,
  fields = 'id,parent,menu_order,title,status,type,link,slug'
): Promise<WPPost[]> {
  return apiFetch<WPPost[]>({
    path: `/${restBase}?per_page=50&_fields=${fields}&status=${STATUS}&search=${encodeURIComponent(query)}`,
  });
}

/**
 * Duplicate a post: fetches full content then creates a draft copy.
 */
export async function duplicatePost(restBase: string, post: WPPost): Promise<WPPost> {
  const full = await apiFetch<{ content: { raw: string }; meta: Record<string, unknown> }>({
    path: `/${restBase}/${post.id}?context=edit&_fields=content,meta`,
  });
  return apiFetch<WPPost>({
    path: `/${restBase}`,
    method: 'POST',
    data: {
      title: `Copy of ${post.title.rendered || post.slug}`,
      content: full.content.raw,
      meta: full.meta,
      parent: post.parent,
      menu_order: post.menu_order + 1,
      status: 'draft',
    },
  });
}

/**
 * Restore a trashed post by setting its status back to draft.
 */
export async function restorePost(restBase: string, id: number): Promise<WPPost> {
  return apiFetch<WPPost>({
    path: `/${restBase}/${id}`,
    method: 'POST',
    data: { status: 'draft' },
  });
}

/**
 * Trash a single post (DELETE sends it to trash in WordPress).
 */
export async function trashPost(restBase: string, id: number): Promise<WPPost> {
  return apiFetch<WPPost>({
    path: `/${restBase}/${id}`,
    method: 'DELETE',
  });
}

/**
 * Move a post by updating its parent and menu_order.
 */
export async function movePost(
  restBase: string,
  id: number,
  parentId: number,
  menuOrder: number
): Promise<WPPost> {
  return apiFetch<WPPost>({
    path: `/${restBase}/${id}`,
    method: 'POST',
    data: {
      parent: parentId,
      menu_order: menuOrder,
    },
  });
}
