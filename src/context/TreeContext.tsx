import { createContext, useContext } from 'react';
import type { RefObject } from 'react';
import type { TreeApi } from 'react-arborist';
import type { TreeNode } from '../types';

export interface TreeContextValue {
  restBase: string;
  setTree: React.Dispatch<React.SetStateAction<TreeNode[]>>;
  treeApiRef: RefObject<TreeApi<TreeNode> | null>;
  actionNodeId: string | null;
  setActionNodeId: (id: string | null) => void;
  canEditAll: boolean;
  clearSearch: () => void;
}

const TreeContext = createContext<TreeContextValue | null>(null);

export function useTreeContext(): TreeContextValue {
  const ctx = useContext(TreeContext);
  if (!ctx) throw new Error('useTreeContext must be used within a TreeContext.Provider');
  return ctx;
}

export { TreeContext };
