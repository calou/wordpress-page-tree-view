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
  fields = 'id,parent,menu_order,title,status,type,link,slug'
): Promise<WPPost[]> {
  const firstPagePath = `/${restBase}?per_page=${PER_PAGE}&page=1&_fields=${fields}&orderby=menu_order&order=asc`;

  const response = await apiFetch<WPPost[]>({
    path: firstPagePath,
    parse: false,
  } as ApiFetchOptions);

  // apiFetch with parse:false returns a Response object
  const res = response as unknown as Response;
  const totalPages = parseInt(res.headers.get('X-WP-TotalPages') ?? '1', 10);
  const firstPageData: WPPost[] = await res.json();

  if (totalPages <= 1) {
    return firstPageData;
  }

  const remainingPages = Array.from(
    { length: totalPages - 1 },
    (_, i) => i + 2
  );

  const remainingResults = await Promise.all(
    remainingPages.map((page) =>
      apiFetch<WPPost[]>({
        path: `/${restBase}?per_page=${PER_PAGE}&page=${page}&_fields=${fields}&orderby=menu_order&order=asc`,
      } as ApiFetchOptions)
    )
  );

  return [firstPageData, ...remainingResults].flat();
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
