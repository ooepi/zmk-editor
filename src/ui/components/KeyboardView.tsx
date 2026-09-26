import { useMemo, useState, type Dispatch } from 'react';
import type { ZmkConfig } from '../../core/config.ts';
import {
  controllersFor,
  findKeyboard,
  KEYBOARDS,
  layoutsFor,
  newConfig,
  supportsNiceView,
  type KeyboardDef,
} from '../../core/catalog/keyboards.ts';
import { gridLayout } from '../../core/layouts/index.ts';
import type { EditorAction } from '../state/editorReducer.ts';
import { setPreferences, usePreferences } from '../state/preferences.ts';
import { LayoutPreview } from './LayoutPreview.tsx';

interface KeyboardViewProps {
  config: ZmkConfig;
  dispatch: Dispatch<EditorAction>;
  onCreated: () => void;
}

const FEATURE_LABELS: Record<string, string> = { encoder: 'encoder', display: 'display', underglow: 'RGB', studio: 'Studio', backlight: 'backlight' };

/** The current keyboard's layout, and starting a new config for another keyboard. */
export function KeyboardView({ config, dispatch, onCreated }: KeyboardViewProps) {
  const keyCount = config.keymap.layers[0]?.bindings.length ?? 0;
  const current = findKeyboard(config.keyboard);
  const fitting = current ? layoutsFor(current, keyCount) : [];
  const { layouts } = usePreferences();

  return (
    <div className="keyboard-view">
      <section className="build-section" aria-label="Current keyboard">
        <h2 className="panel-title">This config</h2>
        <p>
          <strong>{current?.name ?? config.keyboard}</strong> <span className="muted">({keyCount} keys)</span>
          {current?.url && (
            <>
              {' '}
              ·{' '}
              <a href={current.url} target="_blank" rel="noreferrer">
                keyboard page
              </a>
            </>
          )}
        </p>
        {!current && (
          <p className="muted small">
            “{config.keyboard}” isn’t in ZMK’s keyboard list (it may be defined in your own repo), so it’s drawn as a grid.
          </p>
        )}
        {current && fitting.length === 0 && (
          <p className="muted small">No {current.name} layout has {keyCount} keys, so the keymap is drawn as a grid.</p>
        )}
        {fitting.length > 1 && (
          <label className="field">
            <span className="field-label">Layout</span>
            <select
              className="input"
              value={layouts[config.keyboard] ?? fitting[0]?.name}
              onChange={(e) => setPreferences({ layouts: { ...layouts, [config.keyboard]: e.target.value } })}
            >
              {fitting.map((l) => (
                <option key={l.name} value={l.name}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      <NewConfig config={config} dispatch={dispatch} onCreated={onCreated} />
    </div>
  );
}

function NewConfig({ config, dispatch, onCreated }: KeyboardViewProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<KeyboardDef | null>(null);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? KEYBOARDS.filter((k) => k.name.toLowerCase().includes(q) || k.id.includes(q)) : KEYBOARDS;
  }, [query]);

  return (
    <section className="build-section" aria-label="Start a new config">
      <h2 className="panel-title">Start a new config</h2>
      <p className="muted small">
        Pick a keyboard from ZMK’s list ({KEYBOARDS.length} keyboards). The editor starts from ZMK’s default keymap for it.
      </p>
      <div className="keyboard-picker">
        <div className="keyboard-list-column">
          <input
            className="input"
            type="search"
            aria-label="Search keyboards"
            placeholder="Search: corne, sofle, kyria…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className="item-list keyboard-list" aria-label="Keyboards">
            {results.map((k) => (
              <li key={k.id}>
                <button
                  type="button"
                  className={`item${selected?.id === k.id ? ' active' : ''}`}
                  aria-pressed={selected?.id === k.id}
                  onClick={() => setSelected(k)}
                >
                  <span>{k.name}</span>
                  <span className="muted small">
                    {k.keyCount} keys{k.split ? ' · split' : ''}
                  </span>
                </button>
              </li>
            ))}
            {results.length === 0 && <li className="muted small">No keyboards match.</li>}
          </ul>
        </div>
        {selected ? (
          <KeyboardDetails key={selected.id} keyboard={selected} config={config} dispatch={dispatch} onCreated={onCreated} />
        ) : (
          <p className="muted">Select a keyboard to see its layout.</p>
        )}
      </div>
    </section>
  );
}

function KeyboardDetails({ keyboard, config, dispatch, onCreated }: KeyboardViewProps & { keyboard: KeyboardDef }) {
  const controllers = controllersFor(keyboard);
  const [controller, setController] = useState(
    controllers.find((c) => c.id === 'nice_nano_v2')?.id ?? controllers[0]?.id ?? '',
  );
  const [niceView, setNiceView] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const layout = layoutsFor(keyboard, keyboard.keyCount)[0] ?? gridLayout(keyboard.keyCount);
  const features = keyboard.features.filter((f) => f in FEATURE_LABELS).map((f) => FEATURE_LABELS[f]);

  const create = async () => {
    if (!window.confirm(`Start a new config for ${keyboard.name}? This replaces what's in the editor (your repo is untouched until you commit).`)) return;
    setWorking(true);
    setError(null);
    try {
      const { config: next, warnings } = await newConfig(keyboard, { controller, niceView, zmkVersion: config.west.zmkVersion });
      dispatch({ type: 'load', config: next, warnings });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="keyboard-details">
      <h3>{keyboard.name}</h3>
      <p className="muted small">
        {keyboard.keyCount} keys{keyboard.split ? ' · split' : ''}
        {features.length > 0 && ` · ${features.join(', ')}`}
        {keyboard.url && (
          <>
            {' · '}
            <a href={keyboard.url} target="_blank" rel="noreferrer">
              keyboard page
            </a>
          </>
        )}
      </p>
      <LayoutPreview layout={layout} label={`${keyboard.name} layout`} />
      {controllers.length > 0 ? (
        <label className="field">
          <span className="field-label">Controller</span>
          <select className="input" value={controller} onChange={(e) => setController(e.target.value)}>
            {controllers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.ble ? '' : ' (USB only)'}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="muted small">This keyboard has its controller built in.</p>
      )}
      {supportsNiceView(keyboard) && (
        <label className="field checkbox">
          <input type="checkbox" checked={niceView} onChange={(e) => setNiceView(e.target.checked)} />
          <span>nice!view display</span>
        </label>
      )}
      <button type="button" className="button primary" disabled={working || !keyboard.keymapPath} onClick={() => void create()}>
        {working ? 'Downloading ZMK’s keymap…' : `Create config for ${keyboard.name}`}
      </button>
      {!keyboard.keymapPath && <p className="field-error">ZMK has no default keymap for this keyboard.</p>}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
