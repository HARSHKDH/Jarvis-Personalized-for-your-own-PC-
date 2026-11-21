import { useCallback, useEffect, useState } from 'react';
import { applyTheme, getStoredTheme, oppositeTheme, storeTheme } from '../utils/theme';

/**
 * Owns the active theme and keeps <html data-theme> + localStorage in sync.
 *
 * Intentionally standalone rather than part of JarvisContext: the boot, auth
 * and enrollment screens render outside JarvisProvider, and the toggle has to
 * work on all of them.
 */
export const useTheme = () => {
  const [theme, setTheme] = useState(getStoredTheme);

  useEffect(() => {
    applyTheme(theme);
    storeTheme(theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => oppositeTheme(current));
  }, []);

  return { theme, toggleTheme, setTheme };
};
