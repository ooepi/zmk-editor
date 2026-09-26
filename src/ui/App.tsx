import { useTheme } from './useTheme.ts';

export function App() {
  const [theme, toggleTheme] = useTheme();

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ⌨
          </span>
          ZMK Editor
        </div>
        <div className="topbar-actions">
          <button type="button" className="button" onClick={toggleTheme}>
            {theme === 'dark' ? 'Light theme' : 'Dark theme'}
          </button>
        </div>
      </header>
      <main className="workspace">
        <section className="canvas" aria-label="Keyboard">
          <p className="placeholder">The keyboard canvas arrives in Milestone 3.</p>
        </section>
        <aside className="panel" aria-label="Details">
          <h2 className="panel-title">Details</h2>
          <p className="muted">Select a key to edit its binding.</p>
        </aside>
      </main>
    </div>
  );
}
