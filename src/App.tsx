import React from 'react';
import { TreePanel } from './components/TreePanel';

export function App() {
  return (
    <TreePanel key='pages'
      restBase='pages'
      hierarchical={true}
    />
  );
}
