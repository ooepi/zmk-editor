import { useId, useMemo, useState, type Dispatch } from 'react';
import type { ZmkConfig } from '../../core/config.ts';
import {
  findSetting,
  readSetting,
  SETTING_GROUPS,
  SETTINGS,
  settingWarnings,
  writeSetting,
  type SettingDef,
  type SettingValue,
} from '../../core/catalog/settings.ts';
import { generateKconfig, parseKconfig } from '../../core/files/kconfig.ts';
import type { EditorAction } from '../state/editorReducer.ts';

interface SettingsViewProps {
  config: ZmkConfig;
  dispatch: Dispatch<EditorAction>;
}

const KNOWN = new Set(
  SETTINGS.flatMap((s) => (s.type.kind === 'choice' ? s.type.options.map((o) => `CONFIG_${o.name}`) : [`CONFIG_${s.name}`])),
);

function duration(ms: number): string {
  if (ms >= 60_000 && ms % 60_000 === 0) return `${ms / 60_000} min`;
  if (ms >= 1000) return `${ms / 1000} s`;
  return `${ms} ms`;
}

function describeDefault(def: SettingDef): string {
  if (def.default === undefined) return 'board default';
  if (def.type.kind === 'bool') return def.default ? 'on' : 'off';
  if (def.type.kind === 'choice') return def.type.options.find((o) => o.name === def.default)?.label ?? String(def.default);
  if (def.type.kind === 'int' && def.type.unit === 'ms') return duration(Number(def.default));
  return `${String(def.default)}${def.type.kind === 'int' && def.type.unit && def.type.unit !== 'ms' ? def.type.unit : ''}`;
}

/** Kconfig settings (`config/<keyboard>.conf`) as forms, grouped like ZMK's docs. */
export function SettingsView({ config, dispatch }: SettingsViewProps) {
  const set = (def: SettingDef, value: SettingValue | undefined) =>
    dispatch({ type: 'editConfig', config: { ...config, kconfig: writeSetting(config.kconfig, def, value) } });
  const warnings = useMemo(() => settingWarnings(config), [config]);
  const others = config.kconfig.lines.filter((l) => l.kind === 'set' && !KNOWN.has(l.name));

  return (
    <div className="settings">
      <h2 className="panel-title">Settings</h2>
      <p className="muted">
        These go in <span className="mono">config/{config.keyboard}.conf</span> and apply to both halves. Empty fields use
        ZMK’s default. Changes take effect after you build and flash.
      </p>

      {warnings.length > 0 && (
        <div className="notice warn" role="alert" aria-label="Setting problems">
          {warnings.map((w) => (
            <div key={w.message} className="row wrap">
              <span>{w.message}</span>
              {w.fix && (
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    const def = w.fix && findSetting(w.fix.name);
                    if (def && w.fix) set(def, w.fix.value);
                  }}
                >
                  Turn on
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="settings-grid">
        {SETTING_GROUPS.map((group) => (
          <section key={group.id} className="settings-card" aria-label={group.label}>
            <h3>{group.label}</h3>
            <p className="muted small">{group.description}</p>
            {SETTINGS.filter((s) => s.group === group.id).map((def) => (
              <SettingField key={def.name} def={def} value={readSetting(config.kconfig, def)} onChange={(v) => set(def, v)} />
            ))}
          </section>
        ))}
      </div>

      {others.length > 0 && (
        <>
          <h2 className="panel-title">Other settings in the file</h2>
          <ul className="notes mono">
            {others.map((l) => l.kind === 'set' && <li key={l.name}>{`${l.name}=${l.value}`}</li>)}
          </ul>
        </>
      )}

      <RawConf key={generateKconfig(config.kconfig)} config={config} dispatch={dispatch} />
    </div>
  );
}

function SettingField({ def, value, onChange }: { def: SettingDef; value: SettingValue | undefined; onChange: (v: SettingValue | undefined) => void }) {
  const id = useId();
  const isSet = value !== undefined;
  const { type } = def;
  const reset = isSet && (
    <button type="button" className="link-button small" onClick={() => onChange(undefined)} aria-label={`Reset ${def.label} to default`}>
      reset
    </button>
  );
  const hint = (
    <span id={`${id}-help`} className="field-help">
      {def.help}
      {def.help && ' '}Default: {describeDefault(def)}.
      {type.kind === 'int' && type.unit === 'ms' && typeof value === 'number' && ` Now: ${duration(value)}.`}
    </span>
  );
  const common = { id, 'aria-describedby': `${id}-help` };

  if (type.kind === 'bool') {
    const effective = value ?? def.default;
    return (
      <div className={`setting${isSet ? ' is-set' : ''}`}>
        <div className="setting-bool">
          {/* Always explicit: boards and shields can change defaults (nice_view turns the display on). */}
          <input {...common} type="checkbox" checked={effective === true} onChange={(e) => onChange(e.target.checked)} />
          <label htmlFor={id}>{def.label}</label>
          {reset}
        </div>
        {hint}
      </div>
    );
  }

  return (
    <div className={`setting${isSet ? ' is-set' : ''}`}>
      <div className="setting-head">
        <label className="setting-label" htmlFor={id}>
          {def.label}
          {type.kind === 'int' && type.unit ? ` (${type.unit})` : ''}
        </label>
        {reset}
      </div>
      {type.kind === 'choice' ? (
        <select {...common} className="input" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">Default ({describeDefault(def)})</option>
          {type.options.map((o) => (
            <option key={o.name} value={o.name}>
              {o.label}
            </option>
          ))}
        </select>
      ) : type.kind === 'int' ? (
        <input
          {...common}
          className="input"
          type="number"
          min={type.min}
          max={type.max}
          placeholder={def.default === undefined ? '' : String(def.default)}
          value={typeof value === 'number' ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
      ) : (
        <input
          {...common}
          className="input"
          maxLength={type.maxLength}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
        />
      )}
      {hint}
    </div>
  );
}

function RawConf({ config, dispatch }: SettingsViewProps) {
  const original = generateKconfig(config.kconfig);
  const [text, setText] = useState(original);
  return (
    <details className="raw-conf">
      <summary>Edit the .conf file directly</summary>
      <textarea
        className="input mono"
        aria-label=".conf file"
        rows={16}
        spellCheck={false}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="row">
        <button
          type="button"
          className="button primary"
          disabled={text === original}
          onClick={() => dispatch({ type: 'editConfig', config: { ...config, kconfig: parseKconfig(text) } })}
        >
          Apply
        </button>
        <button type="button" className="button" disabled={text === original} onClick={() => setText(original)}>
          Discard
        </button>
      </div>
    </details>
  );
}
