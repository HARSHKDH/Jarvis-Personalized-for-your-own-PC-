import { createContext, useContext } from 'react';
import { useTheme } from '../hooks/useTheme';

const ThemeContext = createContext(null);

/**
 * Mounted in main.jsx — above App — so the theme is available on every
 * screen including boot, voice auth and enrollment, which all render
 * outside JarvisProvider.
 */
export const ThemeProvider = ({ children }) => {
  const theme = useTheme();
  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useThemeContext = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeContext must be used within ThemeProvider');
  return ctx;
};
