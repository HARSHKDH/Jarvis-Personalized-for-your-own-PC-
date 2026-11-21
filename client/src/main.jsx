import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { ThemeProvider } from './context/ThemeContext';
import { applyTheme, getStoredTheme } from './utils/theme';
import './index.css';

// Apply the saved theme before the first paint so the HUD never flashes
// in the wrong palette on reload.
applyTheme(getStoredTheme());

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
