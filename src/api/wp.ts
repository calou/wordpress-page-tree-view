import apiFetch from '@wordpress/api-fetch';
import type { WPPost, ContentType } from '../types';

// @wordpress/api-fetch types are loose; this helps bridge them
type ApiFetchOptions = Parameters<typeof apiFetch>[0];

const PER_PAGE = 100;

/**
 * Fetch all posts of a given type, paginating in parallel after the first page.
 */
export async function fetchAllPosts(
  restBase: string,
  fields = 'id,parent,menu_order,title,status,type,link,slug',
  onProgress?: (loaded: number, total: number) => void,
  parent?: number
): Promise<WPPost[]> {
  const parentParam = parent !== undefined ? `&parent=${parent}` : '';
  const firstPagePath = `/${restBase}?per_page=${PER_PAGE}&page=1&_fields=${fields}&orderby=menu_order&order=asc&status=publish,draft,private,pending,future,trash${parentParam}`;

  const response = await apiFetch<WPPost[]>({
    path: firstPagePath,
    parse: false,
  } as ApiFetchOptions);

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
        path: `/${restBase}?per_page=${PER_PAGE}&page=${page}&_fields=${fields}&orderby=menu_order&order=asc&status=publish,draft,private,pending,future,trash${parentParam}`,
      } as ApiFetchOptions);
      loaded += data.length;
      onProgress?.(loaded, total);
      return data;
    })
  );

  return [firstPageData, ...remainingResults].flat();
}

/**
 * Fetch immediate children of a single parent node (single page, no pagination needed).
 */
export async function fetchChildren(
  restBase: string,
  parentId: number,
  fields = 'id,parent,menu_order,title,status,type,link,slug'
): Promise<WPPost[]> {
  return apiFetch<WPPost[]>({
    path: `/${restBase}?per_page=${PER_PAGE}&parent=${parentId}&_fields=${fields}&orderby=menu_order&order=asc&status=publish,draft,private,pending,future,trash`,
  } as ApiFetchOptions);
}

/**
 * Fetch all registered post types from the REST API.
 */
export async function fetchPostTypes(): Promise<Record<string, ContentType>> {
  return apiFetch<Record<string, ContentType>>({
    path: '/wp/v2/types',
  } as ApiFetchOptions);
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
  } as ApiFetchOptions);
}

/**
 * Trash a single post (DELETE sends it to trash in WordPress).
 */
export async function trashPost(restBase: string, id: number): Promise<WPPost> {
  return apiFetch<WPPost>({
    path: `/${restBase}/${id}`,
    method: 'DELETE',
  } as ApiFetchOptions);
}

/**
 * Recursively trash a post and all its descendants (deepest-first).
 */
export async function trashWithDescendants(restBase: string, id: number): Promise<void> {
  const children = await fetchChildren(restBase, id);
  for (const child of children) {
    await trashWithDescendants(restBase, child.id);
  }
  await trashPost(restBase, id);
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
  } as ApiFetchOptions);
}
