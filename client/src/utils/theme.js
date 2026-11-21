/**
 * theme.js
 * Persist and apply the HUD colour theme.
 *
 * The theme is nothing more than a `data-theme` attribute on <html>.
 * Every colour in index.css resolves from RGB channel tokens scoped to
 * that attribute, so flipping it re-skins the whole app with no React
 * re-render required. That matters here because the boot, auth and
 * enrollment screens live outside JarvisProvider.
 */

const THEME_KEY = 'jarvis_theme';

export const THEMES = ['dark', 'light'];

// JARVIS ships dark. We deliberately do NOT follow prefers-color-scheme on
// first run — a returning user should always see the HUD they remember.
export const DEFAULT_THEME = 'dark';

/** Read the saved theme, falling back to dark. */
export const getStoredTheme = () => {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (THEMES.includes(saved)) return saved;
  } catch {
    // localStorage can throw in private mode / when storage is blocked
  }
  return DEFAULT_THEME;
};

/** Persist the theme. Never throws. */
export const storeTheme = (theme) => {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // non-fatal — the theme still applies for this session
  }
};

/**
 * Apply a theme to the document. Returns the theme actually applied.
 * Also syncs <meta name="theme-color"> so the browser address bar and the
 * Electron title bar match the HUD.
 */
export const applyTheme = (theme) => {
  const next = THEMES.includes(theme) ? theme : DEFAULT_THEME;
  const root = document.documentElement;
  root.dataset.theme = next;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const bg = getComputedStyle(root).getPropertyValue('--bg-deep').trim();
    if (bg) meta.setAttribute('content', bg);
  }

  return next;
};

/** Flip dark ↔ light. */
export const oppositeTheme = (theme) => (theme === 'light' ? 'dark' : 'light');
