import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './style.css';

const rootEl = document.getElementById('wptv-root');

if (rootEl) {
  // Initialize @wordpress/api-fetch with the nonce
  import('@wordpress/api-fetch').then(({ default: apiFetch }) => {
    apiFetch.use(
      apiFetch.createNonceMiddleware(window.wptvConfig?.nonce ?? '')
    );
    apiFetch.use(
      apiFetch.createRootURLMiddleware(window.wptvConfig?.restUrl ?? '/wp-json/')
    );

    createRoot(rootEl).render(<App />);
  });
}
