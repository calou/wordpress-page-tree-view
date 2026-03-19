import { useState, useEffect } from 'react';
import { fetchPostTypes } from '../api/wp';
import type { ContentType } from '../types';

// Types to exclude from the tree view
const EXCLUDED_TYPES = new Set([
  'attachment',
  'nav_menu_item',
  'post',
  'wp_block',
  'wp_global_styles',
  'wp_template',
  'wp_template_part',
  'wp_navigation',
  'wp_font_family',
  'wp_font_face',
]);

interface UseContentTypesResult {
  types: ContentType[];
  isLoading: boolean;
  error: string | null;
}

export function useContentTypes(): UseContentTypesResult {
  const [types, setTypes] = useState<ContentType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchPostTypes()
      .then((all) => {
        if (cancelled) return;
        setTypes(
          Object.values(all).filter((t) => !EXCLUDED_TYPES.has(t.slug) && t.rest_base && t.hierarchical)
        );
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message ?? 'Failed to load content types');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { types, isLoading, error };
}
