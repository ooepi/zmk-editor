import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { customLayout, generateConfig, type ZmkConfig } from '../core/config.ts';
import { toggleComboKey, replaceCombo } from '../core/keymap/comboEdit.ts';
import { behaviorKind } from '../core/keymap/model.ts';
import { applyToEncoder, pushRecent, type EncoderDirection, type PaletteItem } from '../core/keymap/palette.ts';
import { findKeyboard } from '../core/catalog/keyboards.ts';
import { physicalLayoutFor } from '../core/layouts/index.ts';
import { BehaviorsView } from './components/BehaviorsView.tsx';
import { BindingPanel } from './components/BindingPanel.tsx';
import { BuildView } from './components/BuildView.tsx';
import { useBuildSession, type BuildState } from './state/buildSession.ts';
import { pendingChanges } from '../core/github/changes.ts';
import { ComboBanner } from './components/ComboBanner.tsx';
import { CombosPanel } from './components/CombosPanel.tsx';
import { ConditionalLayersPanel } from './components/ConditionalLayersPanel.tsx';
import { EncoderPanel } from './components/EncoderPanel.tsx';
import { EncoderStrip } from './components/EncoderStrip.tsx';
import { HardwareWizard } from './components/HardwareWizard.tsx';
import { KeyboardCanvas } from './components/KeyboardCanvas.tsx';
import { KeyboardView } from './components/KeyboardView.tsx';
import { KeyPalette } from './components/KeyPalette.tsx';
import { LayoutDesigner } from './components/LayoutDesigner.tsx';
import { LayerRail } from './components/LayerRail.tsx';
import { PrintView } from './components/PrintView.tsx';
import { SelectionPanel } from './components/SelectionPanel.tsx';
import { ThemeToggle } from './components/ThemeToggle.tsx';
import { Icon, type IconName } from './components/Icon.tsx';
import { Dialog } from './components/ui/Dialog.tsx';
import { IconButton } from './components/ui/IconButton.tsx';
import { Section } from './components/ui/Section.tsx';
import { ModulesView } from './components/ModulesView.tsx';
import { ScreensView } from './components/ScreensView.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { StudioConnect } from './components/StudioConnect.tsx';
import { StudioMismatchDialog } from './components/StudioMismatchDialog.tsx';
import { StudioOnlyNote } from './components/StudioOnlyNote.tsx';
import { StudioSaveBar } from './components/StudioSaveBar.tsx';
import { Toolbar } from './components/Toolbar.tsx';
import { VersionSelect } from './components/VersionSelect.tsx';
import type { KeyRef } from './dnd.ts';
import { HelpContext } from './help/helpContext.ts';
import { HelpLink } from './help/HelpLink.tsx';
import { HelpView } from './help/HelpView.tsx';
import { SHORTCUTS } from './shortcuts.ts';
import { hasStoredConfig, useEditor } from './state/useEditor.ts';
import { loadGitHubSettings } from './state/github.ts';
import { demoConfig } from './state/demo.ts';
import { isLoginCallback } from './state/githubLogin.ts';
import { setPreferences, usePreferences } from './state/preferences.ts';
import { useTheme } from './useTheme.ts';
import { useStudioSession } from './state/studioSession.ts';
import type { StudioDevice } from './studio/device.ts';
import { fakeStudioRequested, openKeyboard, serialSupported } from './studio/support.ts';

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

/**
 * `welcome`: greet a first visit with the welcome dialog (the app turns it on; tests opt in).
 * `studioOpen`: how to open a ZMK Studio keyboard, for tests; the app uses Web Serial.
 */
export function App({ welcome = false, studioOpen }: { welcome?: boolean; studioOpen?: () => Promise<StudioDevice> } = {}) {
  const hash = useHash();
  if (hash === '#design') {
    return (
      <Suspense fallback={null}>
        <DesignSystemPage />
      </Suspense>
    );
  }
  return <Editor welcome={welcome} studioOpen={studioOpen} />;
}

/** How long a short confirmation stays on screen. */
const TRANSIENT_NOTICE_MS = 4000;

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName));
}

function Editor({ welcome, studioOpen }: { welcome: boolean; studioOpen: (() => Promise<StudioDevice>) | undefined }) {
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
  /** Done was refused because the open combo has fewer than two keys. */
  const [comboBlocked, setComboBlocked] = useState(false);
  const [behavior, setBehavior] = useState<string | null>(null);
  const [macro, setMacro] = useState<string | null>(null);
  /** The palette section to open on next time the Keymap tab shows, from "Show in palette". */
  const [paletteStart, setPaletteStart] = useState<string | null>(null);
  /** First time here: no config from before and no repository to reopen. */
  const [newcomer] = useState(() => !hasStoredConfig() && !loadGitHubSettings());
  // The demo is saved on the first load too, so remember that this browser is still to be welcomed.
  useEffect(() => {
    if (newcomer) setPreferences({ welcomePending: true });
  }, [newcomer]);
  /** The GitHub repository and build, kept while you move between tabs. */
  const buildSession = useBuildSession();
  // A jump request is for the next Keymap visit only; going anywhere else drops it.
  if (paletteStart && view !== 'keymap' && view !== 'behaviors' && view !== 'macros') setPaletteStart(null);
  /** A palette tile placed on each clicked key, until Esc. */
  const [armed, setArmed] = useState<PaletteItem | null>(null);
  const { config, layer, key, selection, clipboard, sensor } = state;
  const { keymap } = config;
  // What a commit would change, for the Build & flash tab's badge (only while a repository is open).
  const repoFiles = buildSession.connection?.files;
  const pendingCount = useMemo(
    () => (repoFiles ? pendingChanges(generateConfig(config), repoFiles, config.keyboard).length : 0),
    [config, repoFiles],
  );
  const buildStatus = tabStatus(buildSession.build, pendingCount);
  const keyCount = keymap.layers[0]?.bindings.length ?? 0;
  const { layouts, recent, welcomed, welcomePending } = usePreferences();
  // Not once they've moved on from the demo some other way (opened files, a keyboard, a repository).
  const onDemo = config.keyboard === DEMO_KEYBOARD && !buildSession.connection;
  const showWelcome = welcome && (newcomer || welcomePending) && !welcomed && onDemo;
  const layout = physicalLayoutFor(config.keyboard, keyCount, layouts[config.keyboard], customLayout(config));

  /** The ZMK Studio connection: key and layer edits go to the keyboard while it's live. */
  const studio = useStudioSession(config, dispatch, { open: studioOpen ?? openKeyboard, loadFromKeyboard: config.studio !== undefined || onDemo });
  const studioSupported = studioOpen !== undefined || fakeStudioRequested() || serialSupported();
  const studioMessage = studio.status.phase === 'idle' ? studio.status.message : undefined;
  const studioLive = studio.status.phase === 'connected' || studio.status.phase === 'locked';
  /** The shown layer's keys the keyboard can't take until the next build. */
  const layerUid = keymap.layers[layer]?.uid;
  const needsBuild = useMemo(() => {
    const keys = new Set<number>();
    for (const cell of studio.needsBuild) {
      const [uid, index] = cell.split(':').map(Number);
      if (uid === layerUid && index !== undefined) keys.add(index);
    }
    return keys;
  }, [studio.needsBuild, layerUid]);
  useEffect(() => {
    if (studioMessage) dispatch({ type: 'notify', notice: studioMessage });
  }, [studioMessage, dispatch]);
  // Closing the tab with changes the keyboard hasn't saved asks first.
  useEffect(() => {
    if (!studio.unsaved) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [studio.unsaved]);

  /** Remembers a palette item placed from the palette for its Recent row. */
  const remember = (item: PaletteItem) => setPreferences({ recent: pushRecent(recent, item) });

  const hasSelection = selection.length > 0;
  const hasClipboard = clipboard !== null;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      // A modal dialog handles its own keys; the keymap behind it stays put.
      if (event.target instanceof Element && event.target.closest('dialog')) return;
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

  // Short confirmations ("Combo saved.") clear themselves; other notices wait to be dismissed.
  useEffect(() => {
    if (!state.notice || !state.noticeTransient) return;
    const timer = window.setTimeout(() => dispatch({ type: 'dismissNotice' }), TRANSIENT_NOTICE_MS);
    return () => window.clearTimeout(timer);
    // noticeSeq: the same confirmation again starts a fresh few seconds.
  }, [state.notice, state.noticeTransient, state.noticeSeq, dispatch]);

  // After an undo the open combo may be gone; then nothing is open, and a redo won't reopen it.
  const selectedCombo = keymap.combos.find((c) => c.name === combo);
  if (combo !== null && !selectedCombo) {
    setCombo(null);
    setComboBlocked(false);
  }

  const openCombo = (name: string | null) => {
    setCombo(name);
    setComboBlocked(false);
  };

  /** Done, Esc or a click on empty keyboard space: close the combo and say it's saved (edits apply as you go). */
  const finishCombo = () => {
    if (!selectedCombo) return;
    if (selectedCombo.keyPositions.length < 2) {
      setComboBlocked(true);
      return;
    }
    const name = selectedCombo.name;
    openCombo(null);
    dispatch({ type: 'notify', notice: 'Combo saved.', transient: true });
    // Done removes the editor that had focus: keep keyboard users on the combo they finished.
    window.setTimeout(() => document.querySelector<HTMLElement>(`[data-combo="${CSS.escape(name)}"]`)?.focus());
  };
  const macroCount = keymap.behaviors.filter((b) => behaviorKind(b) === 'macro').length;
  // Help isn't a tab: the ? button in the top bar and the Learn more links open it.
  const tabs: { id: View; label: string; icon: IconName; count?: number }[] = [
    { id: 'keymap', label: 'Keymap', icon: 'keyboard' },
    { id: 'combos', label: 'Combos', icon: 'link', count: keymap.combos.length },
    { id: 'behaviors', label: 'Behaviors', icon: 'sliders', count: keymap.behaviors.length - macroCount },
    { id: 'macros', label: 'Macros', icon: 'listOrdered', count: macroCount },
    { id: 'modules', label: 'Modules', icon: 'puzzle', count: config.west.modules.length },
    { id: 'screens', label: 'Screens', icon: 'monitor' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ];

  const onKeyClick = (index: number, additive = false) => {
    if (view === 'combos') {
      if (selectedCombo) {
        dispatch({ type: 'edit', keymap: replaceCombo(keymap, selectedCombo.name, toggleComboKey(selectedCombo, index)) });
        setComboBlocked(false);
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
            <KeyboardButton
              config={config}
              active={['keyboard', 'designer', 'newKeyboard', 'editHardware'].includes(view)}
              onClick={() => setView('keyboard')}
            />
            <VersionSelect config={config} dispatch={dispatch} />
            <StudioConnect session={studio} supported={studioSupported} />
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
          <div className="viewtabs-group">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`viewtab${view === t.id ? ' active' : ''}`}
                aria-current={view === t.id ? 'page' : undefined}
                aria-label={t.count === undefined ? undefined : `${t.label} (${t.count})`}
                onClick={() => setView(t.id)}
              >
                <Icon name={t.icon} />
                <span>{t.label}</span>
                {t.count ? <span className="viewtab-count">{t.count}</span> : null}
              </button>
            ))}
          </div>
          {/* The last step, set apart: where you go once the keymap is done. */}
          <button
            type="button"
            className={`viewtab build-tab${view === 'build' ? ' active' : ''}`}
            aria-current={view === 'build' ? 'page' : undefined}
            aria-describedby={buildStatus ? 'build-tab-status' : undefined}
            title="Commit to GitHub, build the firmware and flash it"
            onClick={() => setView('build')}
          >
            <Icon name="rocket" />
            Build &amp; flash
            {buildStatus && <BuildTabStatus status={buildStatus} />}
          </button>
          {/* Outside the button, so it describes it without becoming part of its name. */}
          {buildStatus && (
            <span id="build-tab-status" className="sr-only">
              {tabStatusText(buildStatus)}
            </span>
          )}
        </nav>
        <StudioSaveBar session={studio} />
        {state.notice && (
          <div className="notice" role="status">
            {state.notice}
            <button type="button" className="link-button" onClick={() => dispatch({ type: 'dismissNotice' })}>
              Dismiss
            </button>
          </div>
        )}
        {config.studio && view in STUDIO_ONLY_AREAS ? (
          <main className="workspace single">
            <StudioOnlyNote area={STUDIO_ONLY_AREAS[view] ?? ''} device={config.studio.device} onOpenGitHub={() => setView('build')} />
          </main>
        ) : view === 'keyboard' ? (
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
            <SettingsView
              config={config}
              dispatch={dispatch}
              onPlaceUnlock={() => {
                setArmed({ kind: 'binding', binding: { behavior: 'studio_unlock', params: [] } });
                setView('keymap');
              }}
            />
          </main>
        ) : view === 'build' ? (
          <main className="workspace single">
            <BuildView config={config} dispatch={dispatch} session={buildSession} />
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
            <ScreensView config={config} dispatch={dispatch} onKeyboard={() => setView('keyboard')} />
          </main>
        ) : view === 'behaviors' || view === 'macros' ? (
          <main className="workspace single">
            <BehaviorsView
              keymap={keymap}
              kind={view}
              selected={view === 'macros' ? macro : behavior}
              onSelect={view === 'macros' ? setMacro : setBehavior}
              dispatch={dispatch}
              onShowInPalette={(section) => {
                setPaletteStart(section);
                setView('keymap');
              }}
            />
          </main>
        ) : (
          <main className="workspace">
            <section className="canvas-area" aria-label="Keymap">
              {view === 'combos' && selectedCombo && (
                <ComboBanner keys={selectedCombo.keyPositions.length} blocked={comboBlocked} onDone={finishCombo} />
              )}
              <div className="canvas-row">
                {view === 'keymap' && (
                  <LayerRail
                    layers={keymap.layers}
                    active={layer}
                    dispatch={dispatch}
                    addDisabled={config.studio && studioLive && studio.freeLayers === 0 ? 'The keyboard has no spare layers left.' : undefined}
                  />
                )}
                {/* In the combos view a click beside the keyboard (not in a gap between keys) finishes the combo. */}
                <div
                  className="canvas"
                  onClick={view === 'combos' ? (event) => event.target === event.currentTarget && finishCombo() : undefined}
                >
                  <KeyboardCanvas
                    keymap={keymap}
                    layout={layout}
                    layer={view === 'combos' ? 0 : layer}
                    selection={view === 'keymap' ? selection : []}
                    onSelectBox={
                      view === 'keymap'
                        ? (indices, additive) => dispatch({ type: 'selectKeys', indices, additive })
                        : undefined
                    }
                    highlighted={view === 'combos' && selectedCombo ? new Set(selectedCombo.keyPositions.map(Number)) : undefined}
                    onSelectKey={onKeyClick}
                    drop={view === 'keymap' ? keyDrop : undefined}
                    flagged={view === 'keymap' && studioLive ? needsBuild : undefined}
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
              </div>
              {view === 'keymap' && (
                <KeyPalette
                  keymap={keymap}
                  available={config.studio && studio.deviceRefs ? studio.deviceRefs : undefined}
                  armed={armed}
                  selection={selection}
                  onPick={onPaletteClick}
                  onDisarm={() => setArmed(null)}
                  startAt={paletteStart}
                  onStarted={() => setPaletteStart(null)}
                />
              )}
            </section>
            <aside className="panel" aria-label="Details">
              {view === 'combos' ? (
                <CombosPanel
                  keymap={keymap}
                  selected={selectedCombo?.name ?? null}
                  onSelect={openCombo}
                  onDone={finishCombo}
                  dispatch={dispatch}
                />
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
      <StudioMismatchDialog session={studio} keymap={keymap} />
      <WelcomeDialog
        open={showWelcome}
        onKeyboard={() => {
          setPreferences({ welcomed: true });
          setView('keyboard');
        }}
        onConfig={() => {
          setPreferences({ welcomed: true });
          setView('build');
        }}
        onStudio={
          studioSupported
            ? () => {
                setPreferences({ welcomed: true });
                void studio.connect();
              }
            : undefined
        }
        onClose={() => setPreferences({ welcomed: true })}
      />
    </HelpContext.Provider>
  );
}

/** Views ZMK Studio can't change: a Studio-only keymap shows a note there instead. */
const STUDIO_ONLY_AREAS: Partial<Record<View, string>> = {
  combos: 'Combos',
  behaviors: 'Behaviors',
  macros: 'Macros',
  modules: 'Modules',
  screens: 'Screens',
  settings: 'Settings',
};

type TabStatus = { kind: 'pending'; count: number } | { kind: 'building' } | { kind: 'ready' } | { kind: 'failed' };

/** What the Build & flash tab shows beside its name: a build in progress or its outcome, else what's waiting to commit. */
function tabStatus(build: BuildState, pending: number): TabStatus | null {
  if (build.phase === 'committing' || build.phase === 'waiting' || build.phase === 'downloading') return { kind: 'building' };
  // New edits since the last build matter more than how that build went.
  if (pending > 0) return { kind: 'pending', count: pending };
  // Blocked: the firmware built fine, only the browser couldn't download it.
  if (build.phase === 'done' || build.phase === 'blocked') return { kind: 'ready' };
  // Only a build that ran and failed; not "no builds yet" or a network error.
  if (build.phase === 'failed' && build.run && build.run.conclusion !== 'success') return { kind: 'failed' };
  return null;
}

const TAB_STATUS_TEXT = {
  building: 'Building the firmware…',
  ready: 'Firmware ready to download',
  failed: 'The build failed',
} as const;

const tabStatusText = (status: TabStatus) =>
  status.kind === 'pending' ? `${status.count} change${status.count === 1 ? '' : 's'} to commit` : TAB_STATUS_TEXT[status.kind];

function BuildTabStatus({ status }: { status: TabStatus }) {
  return (
    <span className={`build-tab-status ${status.kind}`} aria-hidden="true">
      {status.kind === 'pending' && status.count}
      {status.kind === 'ready' && <Icon name="check" size={12} strokeWidth={3} />}
      {status.kind === 'failed' && <Icon name="x" size={12} strokeWidth={3} />}
    </span>
  );
}

/** The keyboard being edited, the one button that opens the Keyboard page to change it. */
function KeyboardButton({ config, active, onClick }: { config: ZmkConfig; active: boolean; onClick: () => void }) {
  const catalog = findKeyboard(config.keyboard);
  const name = config.studio?.device ?? config.hardware?.displayName ?? catalog?.name ?? config.keyboard;
  const keys = config.keymap.layers[0]?.bindings.length ?? 0;
  const split = config.hardware?.split ?? catalog?.split ?? false;
  return (
    <button
      type="button"
      className={`keyboard-button${active ? ' active' : ''}`}
      aria-label={`Change keyboard: ${name}`}
      title="Keyboard and layout"
      onClick={onClick}
    >
      <span className="keyboard-button-icon" aria-hidden="true">
        <Icon name="keyboard" size={18} />
      </span>
      <span className="keyboard-button-text">
        <span className="keyboard-button-name">{name}</span>
        <span className="keyboard-button-meta">
          {keys} keys{split ? ' · split' : ''}
        </span>
      </span>
      <span className="keyboard-button-change">Change</span>
    </button>
  );
}

/** The shortcuts the keymap overview lists; Help has them all. */
const OVERVIEW_SHORTCUTS = SHORTCUTS.filter((s) => s.handles);

/** "Ctrl+Shift+Z or Ctrl+Y" as key chips: [Ctrl][Shift][Z] or [Ctrl][Y]. */
function ShortcutKeys({ keys }: { keys: string }) {
  return (
    <span className="shortcut-keys">
      {keys.split(' or ').map((combo, i) => (
        <span key={combo} className="shortcut-combo">
          {i > 0 && <span className="muted small">or</span>}
          {combo.split('+').map((k) => (
            <kbd key={k} className="kbd">
              {k}
            </kbd>
          ))}
        </span>
      ))}
    </span>
  );
}

const DEMO_KEYBOARD = demoConfig().config.keyboard;

/** A first visit's welcome: what this is, and where to go from the demo. Closing it means "try the demo". */
function WelcomeDialog({
  open,
  onKeyboard,
  onConfig,
  onStudio,
  onClose,
}: {
  open: boolean;
  onKeyboard: () => void;
  onConfig: () => void;
  /** Absent where the browser can't talk to a keyboard. */
  onStudio: (() => void) | undefined;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      title="Welcome to ZMK Editor"
      description="Edit a ZMK keyboard's keymap, combos and settings, then build the firmware on GitHub. Nothing leaves your browser until you commit."
      onClose={onClose}
    >
      <div className="welcome-choices">
        <button
          type="button"
          className="welcome-choice primary"
          aria-label="Pick your keyboard"
          aria-describedby="welcome-keyboard"
          data-autofocus
          onClick={onKeyboard}
        >
          <span className="welcome-choice-icon">
            <Icon name="keyboard" size={22} />
          </span>
          <strong>Pick your keyboard</strong>
          <span id="welcome-keyboard">Start from ZMK's default keymap for it, or design your own.</span>
        </button>
        <button
          type="button"
          className="welcome-choice"
          aria-label="Open your config from GitHub"
          aria-describedby="welcome-config"
          onClick={onConfig}
        >
          <span className="welcome-choice-icon">
            <Icon name="github" size={22} />
          </span>
          <strong>Open your config from GitHub</strong>
          <span id="welcome-config">Already have a zmk-config repository? Connect it and edit it here.</span>
        </button>
        {onStudio && (
          <button type="button" className="welcome-choice" aria-label="Connect a Studio keyboard" aria-describedby="welcome-studio" onClick={onStudio}>
            <span className="welcome-choice-icon">
              <Icon name="usb" size={22} />
            </span>
            <strong>Connect a Studio keyboard</strong>
            <span id="welcome-studio">Your keyboard runs ZMK Studio? Plug it in over USB and change its keys live.</span>
          </button>
        )}
        <button type="button" className="welcome-choice" aria-label="Try the demo" aria-describedby="welcome-demo" onClick={onClose}>
          <span className="welcome-choice-icon">
            <Icon name="pointer" size={22} />
          </span>
          <strong>Try the demo</strong>
          <span id="welcome-demo">Look around with a Lily58 keymap first. You can pick your keyboard any time.</span>
        </button>
      </div>
    </Dialog>
  );
}

function Overview({ warnings }: { warnings: string[] }) {
  return (
    <>
      <Section
        variant="flat"
        title="Details"
        label="Keymap overview"
        icon="keyboard"
        description={
          <>
            Select a key or an encoder to edit it, or drag keys from the palette below the keyboard. Hover a layer to rename,
            reorder or delete it. <HelpLink to="editing-keys" />
          </>
        }
      />
      <Section variant="flat" title="Shortcuts" actions={<HelpLink to="shortcuts">All shortcuts</HelpLink>}>
        <dl className="shortcut-list">
          {OVERVIEW_SHORTCUTS.map((s) => (
            <div key={s.keys} className="shortcut-row">
              <dt>
                <ShortcutKeys keys={s.keys} />
              </dt>
              <dd>{s.action}</dd>
            </div>
          ))}
        </dl>
      </Section>
      {warnings.length > 0 && (
        <Section variant="flat" title="Import notes" icon="help">
          <ul className="notes">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
