import { useState, type Dispatch } from 'react';
import type { ZmkConfig } from '../../core/config.ts';
import {
  MODULE_CATEGORIES,
  MODULES,
  moduleRevision,
  supportedVersions,
  type ModuleCategory,
  type ModuleDef,
} from '../../core/catalog/modules.ts';
import { UNICODE_MODES } from '../../core/catalog/unicode.ts';
import {
  addModule,
  addTemplateBehavior,
  followZmkVersion,
  getUnicodeMode,
  hasModuleShield,
  moduleVersionMismatches,
  removeModule,
  setModuleShield,
  setUnicodeMode,
} from '../../core/modules.ts';
import type { EditorAction } from '../state/editorReducer.ts';
import { setPreferences, usePreferences } from '../state/preferences.ts';
import { ModuleFinder } from './ModuleFinder.tsx';
import { HelpLink } from '../help/HelpLink.tsx';
import { httpsUrl } from '../../core/url.ts';

interface ModulesViewProps {
  config: ZmkConfig;
  dispatch: Dispatch<EditorAction>;
}

type Filter = ModuleCategory | 'all' | 'installed';

function matches(module: ModuleDef, text: string): boolean {
  const q = text.trim().toLowerCase();
  if (!q) return true;
  return [module.id, module.name, module.description, ...module.behaviors.map((b) => `&${b.ref}`)].some((s) =>
    s.toLowerCase().includes(q),
  );
}

/** The module catalog: add/remove modules, their setup, version warnings, and finding more on GitHub. */
export function ModulesView({ config, dispatch }: ModulesViewProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [text, setText] = useState('');
  const installedIds = new Set(config.west.modules.map((m) => m.name));
  const catalogIds = new Set(MODULES.map((m) => m.id));
  const others = config.west.modules.filter((m) => !catalogIds.has(m.name));
  const mismatches = moduleVersionMismatches(config);
  const version = config.west.zmkVersion;
  const shown = MODULES.filter(
    (m) =>
      (filter === 'all' || (filter === 'installed' ? installedIds.has(m.id) : m.category === filter)) && matches(m, text),
  );

  const remove = (id: string, name: string, hasBehaviors: boolean) => {
    const warning = hasBehaviors ? ' Keys using its behaviors will do nothing.' : '';
    if (!window.confirm(`Remove ${name}?${warning}`)) return;
    const { config: next, replaced } = removeModule(config, id);
    dispatch({
      type: 'editConfig',
      config: next,
      notice: replaced > 0 ? `Removed ${name}; ${replaced} key${replaced > 1 ? 's' : ''} that used it now do nothing.` : `Removed ${name}.`,
    });
  };

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    ...MODULE_CATEGORIES,
    { id: 'installed', label: `Installed (${MODULES.filter((m) => installedIds.has(m.id)).length})` },
  ];

  return (
    <div className="modules">
      <h2 className="panel-title">Modules</h2>
      <p className="muted">
        Modules add behaviors, LED and display features to ZMK. Each is set to the release matching your ZMK version (
        {version}), so the firmware and its modules always fit together. <HelpLink to="modules" />
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

      <div className="row wrap module-filters">
        <input
          className="input"
          type="search"
          placeholder="Filter modules…"
          aria-label="Filter modules"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="chips" role="group" aria-label="Module categories">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`chip${filter === f.id ? ' active' : ''}`}
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="module-grid">
        {shown.map((module) => (
          <ModuleCard
            key={module.id}
            module={module}
            config={config}
            dispatch={dispatch}
            installed={installedIds.has(module.id)}
            onRemove={() => remove(module.id, module.name, module.behaviors.length > 0)}
          />
        ))}
        {shown.length === 0 && <p className="muted">No catalog module matches. Search GitHub below.</p>}
      </div>

      {others.length > 0 && (
        <>
          <h2 className="panel-title">Other modules in west.yml</h2>
          <ul className="notes">
            {others.map((m) => (
              <li key={m.name} className="row wrap">
                <span className="grow">
                  <a className="mono" href={httpsUrl(`${m.urlBase}/${m.name}`)} target="_blank" rel="noreferrer">
                    {m.name}
                  </a>{' '}
                  at {m.revision ?? `${version} (follows ZMK)`}
                </span>
                <button type="button" className="button danger" onClick={() => remove(m.name, m.name, false)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <ModuleFinder config={config} dispatch={dispatch} />
    </div>
  );
}

interface ModuleCardProps extends ModulesViewProps {
  module: ModuleDef;
  installed: boolean;
  onRemove: () => void;
}

function ModuleCard({ module, config, dispatch, installed, onRemove }: ModuleCardProps) {
  const version = config.west.zmkVersion;
  const revision = moduleRevision(module, version);
  const versions = supportedVersions(module)
    .map((v) => (module.revisions[v] === v ? v : `${v} (as ${module.revisions[v]})`))
    .join(', ');
  const own = config.keymap.behaviors.filter((b) => b.label && module.compatibles?.includes(b.compatible));

  return (
    <article className={`module-card${installed ? ' installed' : ''}`} aria-label={module.name}>
      <header className="module-head">
        <div>
          <h3>{module.name}</h3>
          <a className="mono small" href={httpsUrl(module.homepage)} target="_blank" rel="noreferrer">
            {module.id}
          </a>
        </div>
        {installed ? (
          <button type="button" className="button danger" onClick={onRemove}>
            Remove
          </button>
        ) : (
          <button
            type="button"
            className="button primary"
            disabled={!revision}
            onClick={() => dispatch({ type: 'editConfig', config: addModule(config, module.id), notice: `Added ${module.name}.` })}
          >
            Add
          </button>
        )}
      </header>
      <p className="small">{module.description}</p>
      <p className="muted small">
        Works with ZMK {versions}.{!revision && ` Not available for ${version}.`}
      </p>
      {installed && module.behaviors.length > 0 && (
        <p className="muted small">
          Adds {module.behaviors.map((b) => `&${b.ref}`).join(', ')} under “From modules” when you edit a key.
        </p>
      )}
      {installed && module.templates && (
        <div className="module-settings">
          <p className="muted small">
            {own.length > 0
              ? `Yours: ${own.map((b) => `&${b.label}`).join(', ')}. Edit them on the Behaviors tab and put them on keys under “Your behaviors”.`
              : 'This module does nothing until you define a behavior with it. Start from an example:'}
          </p>
          <div className="row wrap">
            {module.templates.map((template) => (
              <button
                key={template.title}
                type="button"
                className="button"
                onClick={() => {
                  const { keymap, label } = addTemplateBehavior(config.keymap, template);
                  dispatch({ type: 'edit', keymap, notice: `Added &${label}. Adjust it on the Behaviors tab, then put it on a key.` });
                }}
              >
                + {template.title}
              </button>
            ))}
          </div>
        </div>
      )}
      {installed && module.shield && <ShieldTargets module={module} config={config} dispatch={dispatch} />}
      {installed && module.kconfig && (
        <p className="muted small">
          Turned on in {config.keyboard}.conf: {Object.keys(module.kconfig).join(', ')}.
        </p>
      )}
      {module.notes && <p className="muted small">{module.notes}</p>}
      {installed && module.id === 'zmk-unicode' && <UnicodeSettings config={config} dispatch={dispatch} />}
    </article>
  );
}

/** Which build targets use the module's shield. */
function ShieldTargets({ module, config, dispatch }: ModulesViewProps & { module: ModuleDef }) {
  const shield = module.shield;
  if (!shield) return null;
  return (
    <div className="module-settings">
      <span className="field-label">
        Use the <code>{shield.name}</code> shield on
      </span>
      <p className="muted small">{shield.help}</p>
      {config.build.include.length === 0 && <p className="muted small">build.yaml has no builds yet.</p>}
      {config.build.include.map((target, index) => {
        const on = hasModuleShield(config.build, module.id, index);
        const name = `${target.shield?.split(/\s+/)[0] ?? '(no shield)'} on ${target.board}`;
        return (
          <label key={index} className="check">
            <input
              type="checkbox"
              checked={on}
              onChange={(e) => dispatch({ type: 'editConfig', config: setModuleShield(config, module.id, index, e.target.checked) })}
            />
            {name}
          </label>
        );
      })}
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
