export interface WPPost {
  id: number;
  parent: number;
  menu_order: number;
  title: { rendered: string };
  status: 'publish' | 'draft' | 'private' | 'pending' | 'trash';
  type: string;
  link: string;
  slug: string;
}

export interface TreeNode {
  id: string;
  name: string;
  children?: TreeNode[];
  data: WPPost;
}

export interface ContentType {
  slug: string;
  name: string;
  rest_base: string;
  hierarchical: boolean;
  rest_namespace: string;
}

export interface WptvConfig {
  nonce: string;
  restUrl: string;
  adminUrl: string;
}

declare global {
  interface Window {
    wptvConfig: WptvConfig;
  }
}
