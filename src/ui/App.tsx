import { lazy, Suspense, useEffect, useState } from 'react';
import { customLayout } from '../core/config.ts';
import { toggleComboKey, replaceCombo } from '../core/keymap/comboEdit.ts';
import { behaviorKind } from '../core/keymap/model.ts';
import { applyToEncoder, pushRecent, type EncoderDirection, type PaletteItem } from '../core/keymap/palette.ts';
import { findKeyboard } from '../core/catalog/keyboards.ts';
import { physicalLayoutFor } from '../core/layouts/index.ts';
import { BehaviorsView } from './components/BehaviorsView.tsx';
import { BindingPanel } from './components/BindingPanel.tsx';
import { BuildView } from './components/BuildView.tsx';
import { CombosPanel } from './components/CombosPanel.tsx';
import { ConditionalLayersPanel } from './components/ConditionalLayersPanel.tsx';
import { EncoderPanel } from './components/EncoderPanel.tsx';
import { EncoderStrip } from './components/EncoderStrip.tsx';
import { HardwareWizard } from './components/HardwareWizard.tsx';
import { KeyboardCanvas } from './components/KeyboardCanvas.tsx';
import { KeyboardView } from './components/KeyboardView.tsx';
import { KeyPalette } from './components/KeyPalette.tsx';
import { LayoutDesigner } from './components/LayoutDesigner.tsx';
import { LayerBar } from './components/LayerBar.tsx';
import { PrintView } from './components/PrintView.tsx';
import { SelectionPanel } from './components/SelectionPanel.tsx';
import { ThemeToggle } from './components/ThemeToggle.tsx';
import { Icon } from './components/Icon.tsx';
import { IconButton } from './components/ui/IconButton.tsx';
import { ModulesView } from './components/ModulesView.tsx';
import { ScreensView } from './components/ScreensView.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { Toolbar } from './components/Toolbar.tsx';
import { VersionSelect } from './components/VersionSelect.tsx';
import type { KeyRef } from './dnd.ts';
import { HelpContext } from './help/helpContext.ts';
import { HelpLink } from './help/HelpLink.tsx';
import { HelpView } from './help/HelpView.tsx';
import { SHORTCUTS } from './shortcuts.ts';
import { useEditor } from './state/useEditor.ts';
import { isLoginCallback } from './state/githubLogin.ts';
import { setPreferences, usePreferences } from './state/preferences.ts';
import { useTheme } from './useTheme.ts';

type View =
  | 'keymap'
  | 'combos'
  | 'behaviors'
  | 'macros'
  | 'modules'
  | 'screens'
  | 'settings'
  | 'build'
  | 'help'
  | 'print'
  | 'keyboard'
  | 'designer'
  | 'newKeyboard'
  | 'editHardware';

/** The living design-system reference, loaded only when someone opens /#design. */
const DesignSystemPage = lazy(() => import('./designSystem/DesignSystemPage.tsx'));

function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

export function App() {
  const hash = useHash();
  if (hash === '#design') {
    return (
      <Suspense fallback={null}>
        <DesignSystemPage />
      </Suspense>
    );
  }
  return <Editor />;
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName));
}

function Editor() {
  const [theme, toggleTheme] = useTheme();
  const [state, dispatch] = useEditor();
  const [view, setView] = useState<View>(() => (isLoginCallback() ? 'build' : 'keymap'));
  /** The Help section asked for; `request` changes on every request so the same section scrolls again. */
  const [help, setHelp] = useState<{ section: string | null; request: number }>({ section: null, request: 0 });
  const openHelp = (section?: string) => {
    setHelp((h) => ({ section: section ?? null, request: h.request + 1 }));
    setView('help');
  };
  const [combo, setCombo] = useState<string | null>(null);
  const [behavior, setBehavior] = useState<string | null>(null);
  const [macro, setMacro] = useState<string | null>(null);
  /** A palette tile placed on each clicked key, until Esc. */
  const [armed, setArmed] = useState<PaletteItem | null>(null);
  const { config, layer, key, selection, clipboard, sensor } = state;
  const { keymap } = config;
  const keyCount = keymap.layers[0]?.bindings.length ?? 0;
  const { layouts, recent } = usePreferences();
  const layout = physicalLayoutFor(config.keyboard, keyCount, layouts[config.keyboard], customLayout(config));

  /** Remembers a palette item placed from the palette for its Recent row. */
  const remember = (item: PaletteItem) => setPreferences({ recent: pushRecent(recent, item) });

  const hasSelection = selection.length > 0;
  const hasClipboard = clipboard !== null;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      const mod = event.ctrlKey || event.metaKey;
      // The wizard keeps its own draft on top of the live config; a global undo/redo
      // here would change that config behind its back (e.g. undoing the load that
      // created the keyboard being edited).
      const wizardOpen = view === 'newKeyboard' || view === 'editHardware';
      if (mod && !wizardOpen && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? 'redo' : 'undo' });
      } else if (mod && !wizardOpen && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        dispatch({ type: 'redo' });
      } else if (event.key === 'Escape') {
        setArmed(null);
        dispatch({ type: 'selectKey', index: null });
      } else if (view !== 'keymap') {
        return;
      } else if (mod && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        dispatch({ type: 'selectKeys', indices: Array.from({ length: keyCount }, (_, i) => i), additive: false });
      } else if (mod && /^[cx]$/i.test(event.key) && hasSelection && !window.getSelection()?.toString()) {
        // With page text selected, Ctrl+C copies that text as usual.
        event.preventDefault();
        dispatch({ type: event.key.toLowerCase() === 'x' ? 'cutKeys' : 'copyKeys' });
      } else if (mod && event.key.toLowerCase() === 'v' && hasClipboard) {
        event.preventDefault();
        dispatch({ type: 'pasteKeys' });
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && hasSelection) {
        event.preventDefault();
        dispatch({ type: 'placeOnSelection', item: { kind: 'binding', binding: { behavior: 'trans', params: [] } } });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch, view, keyCount, hasSelection, hasClipboard]);

  const selectedCombo = keymap.combos.find((c) => c.name === combo);
  const macroCount = keymap.behaviors.filter((b) => behaviorKind(b) === 'macro').length;
  const tabs: { id: View; label: string }[] = [
    { id: 'keymap', label: 'Keymap' },
    { id: 'combos', label: `Combos (${keymap.combos.length})` },
    { id: 'behaviors', label: `Behaviors (${keymap.behaviors.length - macroCount})` },
    { id: 'macros', label: `Macros (${macroCount})` },
    { id: 'modules', label: `Modules (${config.west.modules.length})` },
    { id: 'screens', label: 'Screens' },
    { id: 'settings', label: 'Settings' },
    { id: 'help', label: 'Help' },
  ];

  const onKeyClick = (index: number, additive = false) => {
    if (view === 'combos') {
      if (selectedCombo) {
        dispatch({ type: 'edit', keymap: replaceCombo(keymap, selectedCombo.name, toggleComboKey(selectedCombo, index)) });
      }
      return;
    }
    if (armed) {
      dispatch({ type: 'placeOnKey', index, item: armed });
      remember(armed);
      return;
    }
    if (additive) dispatch({ type: 'toggleKey', index });
    else dispatch({ type: 'selectKey', index: index === key ? null : index });
  };

  // With keys selected a tile goes straight onto them; otherwise the tile is armed for clicking keys.
  const onPaletteClick = (item: PaletteItem) => {
    if (armed) setArmed(JSON.stringify(armed) === JSON.stringify(item) ? null : item);
    else if (hasSelection) {
      dispatch({ type: 'placeOnSelection', item });
      remember(item);
    } else setArmed(item);
  };

  const keyDrop = {
    layer,
    onDropItem: (index: number, item: PaletteItem) => {
      dispatch({ type: 'placeOnKey', index, item });
      remember(item);
    },
    // A key dragged in from another layer is copied; on the same layer keys swap unless Alt/Ctrl copies.
    onDropKey: (from: KeyRef, to: number, copy: boolean) =>
      dispatch(
        from.layer !== layer
          ? { type: 'copyKey', from: from.index, to, fromLayer: from.layer }
          : { type: copy ? 'copyKey' : 'swapKeys', from: from.index, to },
      ),
  };

  return (
    <HelpContext.Provider value={openHelp}>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <span className="brand-name">
              <span className="brand-mark" aria-hidden="true">
                ⌨
              </span>
              ZMK Editor
            </span>
            <div className="top-field">
              <span className="top-field-label" aria-hidden="true">
                Keyboard
              </span>
              <button
                type="button"
                className={`top-select${['keyboard', 'designer', 'newKeyboard', 'editHardware'].includes(view) ? ' active' : ''}`}
                onClick={() => setView('keyboard')}
                title="Keyboard and layout"
              >
                {config.hardware?.displayName ?? findKeyboard(config.keyboard)?.name ?? config.keyboard} ▾
              </button>
            </div>
            <VersionSelect config={config} dispatch={dispatch} />
          </div>
          <div className="topbar-actions">
            <Toolbar
              config={config}
              canUndo={state.past.length > 0}
              canRedo={state.future.length > 0}
              locked={view === 'newKeyboard' || view === 'editHardware'}
              onPrint={() => setView('print')}
              dispatch={dispatch}
            />
            <div className="topbar-end">
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
              <IconButton icon="help" label="Open help" title="Help" onClick={() => openHelp()} />
              <a className="coffee-link" href="https://www.buymeacoffee.com/gristone" target="_blank" rel="noopener noreferrer">
                <span aria-hidden="true">☕</span> Buy me a coffee
              </a>
            </div>
          </div>
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
          {/* The last step, set apart: where you go once the keymap is done. */}
          <button
            type="button"
            className={`viewtab build-tab${view === 'build' ? ' active' : ''}`}
            aria-current={view === 'build' ? 'page' : undefined}
            title="Commit to GitHub, build the firmware and flash it"
            onClick={() => setView('build')}
          >
            <Icon name="rocket" />
            Build &amp; flash
          </button>
        </nav>
        {state.notice && (
          <div className="notice" role="status">
            {state.notice}
            <button type="button" className="link-button" onClick={() => dispatch({ type: 'dismissNotice' })}>
              Dismiss
            </button>
          </div>
        )}
        {view === 'keyboard' ? (
          <main className="workspace single">
            <KeyboardView
              config={config}
              dispatch={dispatch}
              onCreated={() => setView('keymap')}
              onDesign={() => setView('designer')}
              onNewKeyboard={() => setView('newKeyboard')}
              onEditHardware={() => setView('editHardware')}
            />
          </main>
        ) : view === 'designer' ? (
          <main className="workspace single">
            <LayoutDesigner config={config} dispatch={dispatch} onClose={() => setView('keyboard')} />
          </main>
        ) : view === 'newKeyboard' || view === 'editHardware' ? (
          <main className="workspace single">
            <HardwareWizard
              key={view}
              config={config}
              dispatch={dispatch}
              mode={view === 'editHardware' ? 'edit' : 'create'}
              onDone={() => setView(view === 'editHardware' ? 'keyboard' : 'keymap')}
              onCancel={() => setView('keyboard')}
            />
          </main>
        ) : view === 'settings' ? (
          <main className="workspace single">
            <SettingsView config={config} dispatch={dispatch} />
          </main>
        ) : view === 'build' ? (
          <main className="workspace single">
            <BuildView config={config} dispatch={dispatch} />
          </main>
        ) : view === 'print' ? (
          <main className="workspace single">
            <PrintView config={config} layout={layout} onClose={() => setView('keymap')} />
          </main>
        ) : view === 'help' ? (
          <main className="workspace single">
            <HelpView key={help.request} section={help.section} />
          </main>
        ) : view === 'modules' ? (
          <main className="workspace single">
            <ModulesView config={config} dispatch={dispatch} onScreens={() => setView('screens')} />
          </main>
        ) : view === 'screens' ? (
          <main className="workspace single">
            <ScreensView config={config} dispatch={dispatch} onBuild={() => setView('build')} onKeyboard={() => setView('keyboard')} />
          </main>
        ) : view === 'behaviors' || view === 'macros' ? (
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
                  selection={view === 'keymap' ? selection : []}
                  onSelectBox={
                    view === 'keymap' ? (indices, additive) => dispatch({ type: 'selectKeys', indices, additive }) : undefined
                  }
                  highlighted={view === 'combos' && selectedCombo ? new Set(selectedCombo.keyPositions.map(Number)) : undefined}
                  onSelectKey={onKeyClick}
                  drop={view === 'keymap' ? keyDrop : undefined}
                />
                {view === 'keymap' && (
                  <EncoderStrip
                    keymap={keymap}
                    layer={layer}
                    selected={sensor}
                    onSelect={(index) => dispatch({ type: 'selectSensor', index: index === sensor ? null : index })}
                    onDropItem={(index: number, direction: EncoderDirection, item: PaletteItem) => {
                      dispatch({ type: 'placeOnEncoder', index, direction, item });
                      if (applyToEncoder({ behavior: 'trans', params: [] }, item, direction)) remember(item);
                    }}
                  />
                )}
              </div>
              {view === 'keymap' && <KeyPalette keymap={keymap} armed={armed} selection={selection} onPick={onPaletteClick} />}
            </section>
            <aside className="panel" aria-label="Details">
              {view === 'combos' ? (
                <CombosPanel keymap={keymap} selected={combo} onSelect={setCombo} dispatch={dispatch} />
              ) : key !== null ? (
                <BindingPanel
                  key={`${layer}-${key}`}
                  keymap={keymap}
                  layer={layer}
                  keyIndex={key}
                  clipboard={clipboard}
                  dispatch={dispatch}
                />
              ) : selection.length > 1 ? (
                <SelectionPanel keymap={keymap} layer={layer} selection={selection} clipboard={clipboard} dispatch={dispatch} />
              ) : sensor !== null ? (
                <EncoderPanel key={`${layer}-s${sensor}`} keymap={keymap} layer={layer} sensor={sensor} dispatch={dispatch} />
              ) : (
                <>
                  <Overview warnings={state.warnings} />
                  <ConditionalLayersPanel keymap={keymap} dispatch={dispatch} />
                </>
              )}
            </aside>
          </main>
        )}
      </div>
    </HelpContext.Provider>
  );
}

/** The shortcuts the keymap overview lists; Help has them all. */
const OVERVIEW_SHORTCUTS = SHORTCUTS.filter((s) => s.handles);

function Overview({ warnings }: { warnings: string[] }) {
  return (
    <div>
      <h2 className="panel-title">Details</h2>
      <p className="muted">
        Select a key or an encoder to edit it, or drag keys from the palette below the keyboard. Double-click a layer
        tab to rename it. <HelpLink to="editing-keys" />
      </p>
      <p className="muted small">
        Shortcuts: {OVERVIEW_SHORTCUTS.map((s) => `${s.keys}: ${s.action.toLowerCase()}`).join(' · ')}.{' '}
        <HelpLink to="shortcuts">All shortcuts</HelpLink>
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
