import { useEffect, useState } from 'react';
import { toggleComboKey, replaceCombo } from '../core/keymap/comboEdit.ts';
import { behaviorKind } from '../core/keymap/model.ts';
import { getPhysicalLayout, gridLayout } from '../core/layouts/index.ts';
import { BehaviorsView } from './components/BehaviorsView.tsx';
import { BindingPanel } from './components/BindingPanel.tsx';
import { CombosPanel } from './components/CombosPanel.tsx';
import { EncoderPanel } from './components/EncoderPanel.tsx';
import { EncoderStrip } from './components/EncoderStrip.tsx';
import { KeyboardCanvas } from './components/KeyboardCanvas.tsx';
import { LayerBar } from './components/LayerBar.tsx';
import { Toolbar } from './components/Toolbar.tsx';
import { useEditor } from './state/useEditor.ts';
import { useTheme } from './useTheme.ts';

type View = 'keymap' | 'combos' | 'behaviors' | 'macros';

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName));
}

export function App() {
  const [theme, toggleTheme] = useTheme();
  const [state, dispatch] = useEditor();
  const [view, setView] = useState<View>('keymap');
  const [combo, setCombo] = useState<string | null>(null);
  const [behavior, setBehavior] = useState<string | null>(null);
  const [macro, setMacro] = useState<string | null>(null);
  const { config, layer, key, sensor } = state;
  const { keymap } = config;
  const keyCount = keymap.layers[0]?.bindings.length ?? 0;
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
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && key !== null && view === 'keymap') {
        event.preventDefault();
        dispatch({ type: 'setBinding', binding: { behavior: 'trans', params: [] } });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch, key, view]);

  const selectedCombo = keymap.combos.find((c) => c.name === combo);
  const macroCount = keymap.behaviors.filter((b) => behaviorKind(b) === 'macro').length;
  const tabs: { id: View; label: string }[] = [
    { id: 'keymap', label: 'Keymap' },
    { id: 'combos', label: `Combos (${keymap.combos.length})` },
    { id: 'behaviors', label: `Behaviors (${keymap.behaviors.length - macroCount})` },
    { id: 'macros', label: `Macros (${macroCount})` },
  ];

  const onKeyClick = (index: number) => {
    if (view === 'combos') {
      if (selectedCombo) {
        dispatch({ type: 'edit', keymap: replaceCombo(keymap, selectedCombo.name, toggleComboKey(selectedCombo, index)) });
      }
      return;
    }
    dispatch({ type: 'selectKey', index: index === key ? null : index });
  };

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
      <nav className="viewtabs" aria-label="Views">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`viewtab${view === t.id ? ' active' : ''}`}
            aria-current={view === t.id ? 'page' : undefined}
            onClick={() => setView(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {state.notice && (
        <div className="notice" role="status">
          {state.notice}
          <button type="button" className="link-button" onClick={() => dispatch({ type: 'dismissNotice' })}>
            Dismiss
          </button>
        </div>
      )}
      {view === 'behaviors' || view === 'macros' ? (
        <main className="workspace single">
          <BehaviorsView
            keymap={keymap}
            kind={view}
            selected={view === 'macros' ? macro : behavior}
            onSelect={view === 'macros' ? setMacro : setBehavior}
            dispatch={dispatch}
          />
        </main>
      ) : (
        <main className="workspace">
          <section className="canvas-area" aria-label="Keymap">
            {view === 'keymap' && <LayerBar layers={keymap.layers} active={layer} dispatch={dispatch} />}
            <div className="canvas">
              <KeyboardCanvas
                keymap={keymap}
                layout={layout}
                layer={view === 'combos' ? 0 : layer}
                selectedKey={view === 'keymap' ? key : null}
                highlighted={view === 'combos' && selectedCombo ? new Set(selectedCombo.keyPositions.map(Number)) : undefined}
                onSelectKey={onKeyClick}
              />
              {view === 'keymap' && (
                <EncoderStrip
                  keymap={keymap}
                  layer={layer}
                  selected={sensor}
                  onSelect={(index) => dispatch({ type: 'selectSensor', index: index === sensor ? null : index })}
                />
              )}
            </div>
          </section>
          <aside className="panel" aria-label="Details">
            {view === 'combos' ? (
              <CombosPanel keymap={keymap} selected={combo} onSelect={setCombo} dispatch={dispatch} />
            ) : key !== null ? (
              <BindingPanel key={`${layer}-${key}`} keymap={keymap} layer={layer} keyIndex={key} dispatch={dispatch} />
            ) : sensor !== null ? (
              <EncoderPanel key={`${layer}-s${sensor}`} keymap={keymap} layer={layer} sensor={sensor} dispatch={dispatch} />
            ) : (
              <Overview warnings={state.warnings} />
            )}
          </aside>
        </main>
      )}
    </div>
  );
}

function Overview({ warnings }: { warnings: string[] }) {
  return (
    <div>
      <h2 className="panel-title">Details</h2>
      <p className="muted">Select a key or an encoder to edit it. Double-click a layer tab to rename it.</p>
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
