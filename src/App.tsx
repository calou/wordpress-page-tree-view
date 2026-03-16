import React, { useState } from 'react';
import { useContentTypes } from './hooks/useContentTypes';
import { TreePanel } from './components/TreePanel';
import type { ContentType } from './types';

interface Tab {
  label: string;
  restBase: string;
  hierarchical: boolean;
}

export function App() {
  const { hierarchical, flat, isLoading, error } = useContentTypes();
  const [activeTab, setActiveTab] = useState(0);

  if (isLoading) {
    return (
      <div style={{ padding: 24, color: '#787c82' }}>
        <span className="spinner is-active" style={{ float: 'none', margin: '0 8px 0 0' }} />
        Loading content types…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <div className="notice notice-error inline">
          <p>Failed to load content types: {error}</p>
        </div>
      </div>
    );
  }

  const tabs: Tab[] = [
    ...hierarchical.map((t: ContentType) => ({
      label: t.name,
      restBase: t.rest_base,
      hierarchical: true,
    })),
    ...flat.map((t: ContentType) => ({
      label: t.name,
      restBase: t.rest_base,
      hierarchical: false,
    })),
  ];

  if (tabs.length === 0) {
    return (
      <div style={{ padding: 24, color: '#787c82' }}>
        No content types found with REST API support.
      </div>
    );
  }

  const current = tabs[activeTab] ?? tabs[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab bar */}
      <div
        className="nav-tab-wrapper"
        style={{ flexShrink: 0, paddingLeft: 0, marginBottom: 0, borderBottom: '1px solid #c3c4c7' }}
      >
        {tabs.map((tab, i) => (
          <button
            key={tab.restBase}
            className={`nav-tab${i === activeTab ? ' nav-tab-active' : ''}`}
            onClick={() => setActiveTab(i)}
            style={{ cursor: 'pointer', border: 'none', background: 'transparent' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tree panel */}
      <div style={{ flex: 1, minHeight: 0, paddingTop: 8 }}>
        <TreePanel
          key={current.restBase}
          restBase={current.restBase}
          hierarchical={current.hierarchical}
        />
      </div>
    </div>
  );
}
