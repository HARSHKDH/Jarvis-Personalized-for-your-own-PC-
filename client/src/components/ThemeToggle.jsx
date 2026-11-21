import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useThemeContext } from '../context/ThemeContext';

/**
 * Light/dark switch for the whole HUD.
 *
 * variant="inline"   — sits in the StatusBar cluster on the authenticated HUD
 * variant="floating" — fixed top-right, used on boot / auth / enrollment
 *                      screens which have no StatusBar
 *
 * The button is labelled by the theme it switches TO, which is what a button
 * should describe. Current state is still conveyed to assistive tech via
 * aria-pressed.
 */
const ThemeToggle = ({ variant = 'inline', size }) => {
  const { theme, toggleTheme } = useThemeContext();

  const isDark = theme === 'dark';
  const targetLabel = isDark ? 'Light' : 'Dark';
  const description = `Switch to ${targetLabel.toLowerCase()} theme`;
  // The floating variant stands alone on the boot/auth screens, so it gets a
  // larger icon than the one tucked into the StatusBar cluster.
  const iconSize = size ?? (variant === 'floating' ? 15 : 12);

  return (
    <button
      type="button"
      className={`theme-toggle ${variant}`}
      onClick={toggleTheme}
      title={description}
      aria-label={description}
      aria-pressed={!isDark}
    >
      <span className="theme-toggle-icon" aria-hidden="true">
        {isDark ? <Sun size={iconSize} /> : <Moon size={iconSize} />}
      </span>
      {/* The StatusBar cluster is tight, so only the standalone button
          spells out "Mode". */}
      <span>{variant === 'floating' ? `${targetLabel} Mode` : targetLabel}</span>
    </button>
  );
};

export default ThemeToggle;
