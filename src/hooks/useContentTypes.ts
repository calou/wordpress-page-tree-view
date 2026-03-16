import { useState, useEffect } from 'react';
import { fetchPostTypes } from '../api/wp';
import type { ContentType } from '../types';

// Types to exclude from the tree view
const EXCLUDED_TYPES = new Set([
  'attachment',
  'nav_menu_item',
  'wp_block',
  'wp_template',
  'wp_template_part',
  'wp_navigation',
  'wp_font_family',
  'wp_font_face',
]);

interface UseContentTypesResult {
  hierarchical: ContentType[];
  flat: ContentType[];
  isLoading: boolean;
  error: string | null;
}

export function useContentTypes(): UseContentTypesResult {
  const [hierarchical, setHierarchical] = useState<ContentType[]>([]);
  const [flat, setFlat] = useState<ContentType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchPostTypes()
      .then((types) => {
        if (cancelled) return;

        const all = Object.values(types).filter(
          (t) => !EXCLUDED_TYPES.has(t.slug) && t.rest_base
        );

        setHierarchical(all.filter((t) => t.hierarchical));
        setFlat(all.filter((t) => !t.hierarchical));
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

  return { hierarchical, flat, isLoading, error };
}
