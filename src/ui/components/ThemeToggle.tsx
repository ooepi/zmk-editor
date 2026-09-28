import type { Theme } from '../useTheme.ts';
import { Icon } from './Icon.tsx';

/** A sun/moon switch; the knob sits on the active theme. */
export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark theme"
      title={dark ? 'Switch to the light theme' : 'Switch to the dark theme'}
      className={`theme-toggle${dark ? ' dark' : ''}`}
      onClick={onToggle}
    >
      <span className="theme-toggle-icon sun">
        <Icon name="sun" size={15} />
      </span>
      <span className="theme-toggle-icon moon">
        <Icon name="moon" size={15} />
      </span>
      <span className="theme-toggle-knob" aria-hidden="true" />
    </button>
  );
}
