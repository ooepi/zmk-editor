import { useEffect } from 'react';
import { getPhysicalLayout, gridLayout } from '../core/layouts/index.ts';
import { BindingPanel } from './components/BindingPanel.tsx';
import { KeyboardCanvas } from './components/KeyboardCanvas.tsx';
import { LayerBar } from './components/LayerBar.tsx';
import { Toolbar } from './components/Toolbar.tsx';
import { useEditor } from './state/useEditor.ts';
import { useTheme } from './useTheme.ts';

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName));
}

export function App() {
  const [theme, toggleTheme] = useTheme();
  const [state, dispatch] = useEditor();
  const { config, layer, key } = state;
  const keyCount = config.keymap.layers[0]?.bindings.length ?? 0;
  const physical = getPhysicalLayout(config.keyboard);
  const layout = physical && physical.keys.length === keyCount ? physical : gridLayout(keyCount);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? 'redo' : 'undo' });
      } else if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        dispatch({ type: 'redo' });
      } else if (event.key === 'Escape') {
        dispatch({ type: 'selectKey', index: null });
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && key !== null) {
        event.preventDefault();
        dispatch({ type: 'setBinding', binding: { behavior: 'trans', params: [] } });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch, key]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ⌨
          </span>
          ZMK Editor
          <span className="badge">{config.keyboard}</span>
          <span className="badge">ZMK {config.west.zmkVersion}</span>
        </div>
        <Toolbar
          config={config}
          canUndo={state.past.length > 0}
          canRedo={state.future.length > 0}
          theme={theme}
          onToggleTheme={toggleTheme}
          dispatch={dispatch}
        />
      </header>
      <main className="workspace">
        <section className="canvas-area" aria-label="Keymap">
          <LayerBar layers={config.keymap.layers} active={layer} dispatch={dispatch} />
          {state.notice && (
            <div className="notice" role="status">
              {state.notice}
              <button type="button" className="link-button" onClick={() => dispatch({ type: 'dismissNotice' })}>
                Dismiss
              </button>
            </div>
          )}
          <div className="canvas">
            <KeyboardCanvas
              keymap={config.keymap}
              layout={layout}
              layer={layer}
              selectedKey={key}
              onSelectKey={(index) => dispatch({ type: 'selectKey', index: index === key ? null : index })}
            />
          </div>
        </section>
        <aside className="panel" aria-label="Details">
          {key !== null ? (
            <BindingPanel key={`${layer}-${key}`} keymap={config.keymap} layer={layer} keyIndex={key} dispatch={dispatch} />
          ) : (
            <Overview warnings={state.warnings} />
          )}
        </aside>
      </main>
    </div>
  );
}

function Overview({ warnings }: { warnings: string[] }) {
  return (
    <div>
      <h2 className="panel-title">Details</h2>
      <p className="muted">Select a key to edit it. Double-click a layer tab to rename it.</p>
      <p className="muted small">
        Shortcuts: Ctrl+Z undo · Ctrl+Shift+Z redo · Delete makes the key transparent · Esc deselects
      </p>
      {warnings.length > 0 && (
        <>
          <h2 className="panel-title">Import notes</h2>
          <ul className="notes">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
