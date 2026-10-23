import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { BUILD_ID } from './utils/build';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);

// Offline-capable PWA: cache app shell (production only).
// ?v=BUILD_ID forces the browser to re-check sw.js on every deploy.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(BUILD_ID)}`).catch(() => undefined);
  });
}
