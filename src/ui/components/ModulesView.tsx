import type { Dispatch } from 'react';
import type { ZmkConfig } from '../../core/config.ts';
import { MODULES, type ModuleDef } from '../../core/catalog/modules.ts';
import { UNICODE_MODES } from '../../core/catalog/unicode.ts';
import { findVersionMismatches } from '../../core/files/west.ts';
import { addModule, followZmkVersion, getUnicodeMode, removeModule, setUnicodeMode } from '../../core/modules.ts';
import type { EditorAction } from '../state/editorReducer.ts';
import { setPreferences, usePreferences } from '../state/preferences.ts';

interface ModulesViewProps {
  config: ZmkConfig;
  dispatch: Dispatch<EditorAction>;
}

/** The module catalog: add/remove modules, unicode settings, and version warnings. */
export function ModulesView({ config, dispatch }: ModulesViewProps) {
  const installedIds = new Set(config.west.modules.map((m) => m.name));
  const catalogIds = new Set(MODULES.map((m) => m.id));
  const others = config.west.modules.filter((m) => !catalogIds.has(m.name));
  const mismatches = findVersionMismatches(config.west);
  const version = config.west.zmkVersion;

  const remove = (module: ModuleDef) => {
    if (!window.confirm(`Remove ${module.name}? Keys using its behaviors will do nothing.`)) return;
    const { config: next, replaced } = removeModule(config, module.id);
    dispatch({
      type: 'editConfig',
      config: next,
      notice: replaced > 0 ? `Removed ${module.name}; ${replaced} key${replaced > 1 ? 's' : ''} that used it now do nothing.` : `Removed ${module.name}.`,
    });
  };

  return (
    <div className="modules">
      <h2 className="panel-title">Modules</h2>
      <p className="muted">
        Modules add behaviors to ZMK. Each follows your ZMK version ({version}), so the firmware and its modules always
        match.
      </p>

      {mismatches.length > 0 && (
        <div className="notice warn" role="alert">
          {mismatches.map((m) => (
            <div key={m.module} className="row wrap">
              <span>
                <strong>{m.module}</strong> is pinned to <code>{m.revision}</code> instead of ZMK {m.zmkVersion}. Mixed
                versions are the most common reason builds break.
              </span>
              <button
                type="button"
                className="button"
                onClick={() => dispatch({ type: 'editConfig', config: followZmkVersion(config, m.module) })}
              >
                Follow ZMK {m.zmkVersion}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="module-grid">
        {MODULES.map((module) => {
          const installed = installedIds.has(module.id);
          const supported = module.zmkVersions.includes(version);
          return (
            <article key={module.id} className={`module-card${installed ? ' installed' : ''}`} aria-label={module.name}>
              <header className="module-head">
                <div>
                  <h3>{module.name}</h3>
                  <a className="mono small" href={module.homepage} target="_blank" rel="noreferrer">
                    {module.id}
                  </a>
                </div>
                {installed ? (
                  <button type="button" className="button danger" onClick={() => remove(module)}>
                    Remove
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button primary"
                    disabled={!supported}
                    onClick={() => dispatch({ type: 'editConfig', config: addModule(config, module.id), notice: `Added ${module.name}.` })}
                  >
                    Add
                  </button>
                )}
              </header>
              <p className="small">{module.description}</p>
              <p className="muted small">
                Works with ZMK {module.zmkVersions.join(', ')}.
                {!supported && ` Not available for ${version}.`}
              </p>
              {installed && module.behaviors.length > 0 && (
                <p className="muted small">
                  Adds {module.behaviors.map((b) => `&${b.ref}`).join(', ')} under “From modules” when you edit a key.
                </p>
              )}
              {installed && module.id === 'zmk-unicode' && <UnicodeSettings config={config} dispatch={dispatch} />}
            </article>
          );
        })}
      </div>

      {others.length > 0 && (
        <>
          <h2 className="panel-title">Other modules in west.yml</h2>
          <ul className="notes">
            {others.map((m) => (
              <li key={m.name}>
                <span className="mono">{m.name}</span> from {m.urlBase} at {m.revision ?? `${version} (follows ZMK)`}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function UnicodeSettings({ config, dispatch }: ModulesViewProps) {
  const mode = getUnicodeMode(config.keymap);
  const current = UNICODE_MODES.find((m) => m.id === mode);
  const { unicodeLanguages } = usePreferences();
  const finnish = unicodeLanguages.includes('swedish');
  return (
    <div className="module-settings">
      <label className="field">
        <span className="field-label">Computer input method</span>
        <select
          className="input"
          value={mode}
          onChange={(e) =>
            dispatch({ type: 'edit', keymap: setUnicodeMode(config.keymap, e.target.value) })
          }
        >
          {!current && <option value={mode}>{mode}</option>}
          {UNICODE_MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} ({m.os})
            </option>
          ))}
        </select>
      </label>
      {current && <p className="muted small">{current.setup}</p>}
      <div className="row wrap">
        <button
          type="button"
          className={`button${finnish ? ' active' : ''}`}
          aria-pressed={finnish}
          onClick={() => setPreferences({ unicodeLanguages: finnish ? [] : ['swedish'] })}
        >
          {finnish ? '✓ ' : ''}Finnish/Swedish preset (ä, ö, å first)
        </button>
      </div>
    </div>
  );
}
