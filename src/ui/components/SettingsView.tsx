import { useId, useMemo, useState, type Dispatch, type ReactNode } from 'react';
import type { ZmkConfig } from '../../core/config.ts';
import {
  findSetting,
  lacksHardwareFor,
  readSetting,
  SETTING_GROUPS,
  SETTINGS,
  settingWarnings,
  writeSetting,
  type SettingDef,
  type SettingGroup,
  type SettingValue,
} from '../../core/catalog/settings.ts';
import { generateKconfig, parseKconfig } from '../../core/files/kconfig.ts';
import type { EditorAction } from '../state/editorReducer.ts';
import { HelpLink } from '../help/HelpLink.tsx';
import { Icon, type IconName } from './Icon.tsx';
import { IconButton } from './ui/IconButton.tsx';
import { Switch } from './ui/Switch.tsx';
import { NumberInput } from './ui/NumberInput.tsx';
import { StudioSettings } from './StudioSettings.tsx';

interface SettingsViewProps {
  config: ZmkConfig;
  dispatch: Dispatch<EditorAction>;
  /** Arms the Studio unlock tile on the Keymap tab. */
  onPlaceUnlock: () => void;
}

/** What the right-hand pane shows: one group, every changed setting, ZMK Studio, or the raw file. */
type Pane = SettingGroup | 'changed' | 'studio' | 'raw';

const GROUP_ICONS: Record<SettingGroup, IconName> = {
  power: 'zap',
  bluetooth: 'bluetooth',
  battery: 'battery',
  underglow: 'sun',
  backlight: 'sunDim',
  display: 'monitor',
  input: 'mousePointer',
  keyboard: 'usb',
};

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

function groupOf(id: SettingGroup) {
  const group = SETTING_GROUPS.find((g) => g.id === id);
  if (!group) throw new Error(`Unknown setting group: ${id}`);
  return group;
}
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Kconfig settings (`config/<keyboard>.conf`): pick a group on the left, change it on the right. */
export function SettingsView({ config, dispatch, onPlaceUnlock }: SettingsViewProps) {
  const [pane, setPane] = useState<Pane>('power');
  /** Groups whose advanced settings are shown. */
  const [advancedOpen, setAdvancedOpen] = useState<Set<SettingGroup>>(() => new Set());
  /** The group to go back to when Changed only is turned off. */
  const [lastGroup, setLastGroup] = useState<SettingGroup>('power');
  const openGroup = (group: SettingGroup) => {
    setPane(group);
    setLastGroup(group);
  };
  /** Opens a setting's group and focuses the setting, once its row is on screen. */
  const showSetting = (name: string) => {
    const def = findSetting(name);
    if (!def) return;
    openGroup(def.group);
    window.setTimeout(() => {
      const control = document.querySelector<HTMLElement>(`[data-setting="${name}"] :is(input, select)`);
      control?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      control?.focus({ preventScroll: true });
    });
  };
  const set = (def: SettingDef, value: SettingValue | undefined) =>
    dispatch({ type: 'editConfig', config: { ...config, kconfig: writeSetting(config.kconfig, def, value) } });
  const warnings = useMemo(() => settingWarnings(config), [config]);
  // Lines the fields can't show: settings this page doesn't know, and known ones with a value it can't read.
  const others = config.kconfig.lines.flatMap((l) => {
    if (l.kind !== 'set') return [];
    if (!KNOWN.has(l.name)) return [`${l.name}=${l.value}`];
    const def = findSetting(l.name.replace(/^CONFIG_/, ''));
    return def && def.type.kind !== 'choice' && readSetting(config.kconfig, def) === undefined
      ? [`${l.name}=${l.value} (value not understood)`]
      : [];
  });
  /** "Changed" means set in the .conf: the counters, the filter and the row markers all use this. */
  const changed = SETTINGS.filter((def) => readSetting(config.kconfig, def) !== undefined);
  const changedIn = (group: SettingGroup) => changed.filter((def) => def.group === group).length;

  const row = (def: SettingDef) => (
    <SettingRow
      key={def.name}
      def={def}
      value={readSetting(config.kconfig, def)}
      unavailable={
        lacksHardwareFor(config, def.name)
          ? `${config.hardware?.displayName ?? 'This keyboard'} doesn’t have this hardware yet.`
          : undefined
      }
      onChange={(v) => set(def, v)}
    />
  );

  return (
    <div className="settings">
      <header className="settings-head">
        <div>
          <h2 className="panel-title">Settings</h2>
          <p className="muted small">
            These go in <span className="mono">config/{config.keyboard}.conf</span> and apply to both halves. Changes take effect
            after you build and flash. <HelpLink to="settings" />
          </p>
        </div>
        <button
          type="button"
          className={`chip settings-filter${pane === 'changed' ? ' active' : ''}`}
          aria-pressed={pane === 'changed'}
          onClick={() => setPane(pane === 'changed' ? lastGroup : 'changed')}
        >
          <Icon name="listFilter" size={14} />
          Changed only
          <span className="settings-count">{changed.length}</span>
        </button>
      </header>

      {warnings.length > 0 && (
        <div className="notice warn settings-warnings" role="alert" aria-label="Setting problems">
          {warnings.map((w) => {
            const group = groupOf(findSetting(w.setting)?.group ?? 'power');
            return (
              <div key={w.message} className="settings-warning">
                <span className="grow">
                  {w.message}{' '}
                  <button
                    type="button"
                    className="link-button"
                    aria-label={`Show ${group.label}`}
                    onClick={() => showSetting(w.setting)}
                  >
                    {group.label} →
                  </button>
                </span>
                {w.fix && (
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      const def = w.fix && findSetting(w.fix.name);
                      if (def && w.fix) set(def, w.fix.value);
                    }}
                  >
                    {w.fix.value === false ? 'Turn off' : 'Turn on'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Setting groups">
          {SETTING_GROUPS.map((g) => {
            const count = changedIn(g.id);
            return (
              <button
                key={g.id}
                type="button"
                className={`settings-nav-item${pane === g.id ? ' active' : ''}`}
                aria-current={pane === g.id ? 'true' : undefined}
                onClick={() => openGroup(g.id)}
              >
                <Icon name={GROUP_ICONS[g.id]} size={16} />
                <span className="grow">{g.label}</span>
                {count > 0 && <span className="settings-nav-count">{count} changed</span>}
              </button>
            );
          })}
          <hr className="settings-nav-rule" />
          <button
            type="button"
            className={`settings-nav-item${pane === 'studio' ? ' active' : ''}`}
            aria-current={pane === 'studio' ? 'true' : undefined}
            onClick={() => setPane('studio')}
          >
            <Icon name="usb" size={16} />
            <span className="grow">ZMK Studio</span>
          </button>
          <button
            type="button"
            className={`settings-nav-item${pane === 'raw' ? ' active' : ''}`}
            aria-current={pane === 'raw' ? 'true' : undefined}
            onClick={() => setPane('raw')}
          >
            <Icon name="code" size={16} />
            <span className="grow">Raw .conf</span>
            {others.length > 0 && <span className="settings-nav-count muted">{others.length} other</span>}
          </button>
        </nav>

        <div className="settings-pane">
          {pane === 'studio' ? (
            <StudioSettings config={config} dispatch={dispatch} onPlaceUnlock={onPlaceUnlock} />
          ) : pane === 'raw' ? (
            <RawPane config={config} dispatch={dispatch} others={others} />
          ) : pane === 'changed' ? (
            // Keyed by keyboard: another keyboard's .conf starts a fresh list.
            <ChangedOnly key={config.keyboard} changed={changed} row={row} onShowGroup={openGroup} />
          ) : (
            <GroupView
              key={`${pane}-${config.keyboard}`}
              group={pane}
              changed={changed}
              row={row}
              showAdvanced={advancedOpen.has(pane)}
              onShowAdvanced={(show) =>
                setAdvancedOpen((open) => {
                  const next = new Set(open);
                  if (show) next.add(pane);
                  else next.delete(pane);
                  return next;
                })
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

function GroupHeader({ group }: { group: SettingGroup }) {
  const g = groupOf(group);
  return (
    <header className="settings-group-head">
      <span className="settings-group-icon">
        <Icon name={GROUP_ICONS[group]} size={20} />
      </span>
      <div>
        <h3>{g.label}</h3>
        <p className="muted small">{g.description}</p>
      </div>
    </header>
  );
}

/**
 * Names that stay listed once shown while a pane is open, so a row doesn't vanish while
 * it's being edited (a field cleared to retype) or right after its reset.
 */
function useKept(names: string[]): Set<string> {
  const [kept, setKept] = useState(() => new Set(names));
  if (names.some((n) => !kept.has(n))) setKept(new Set([...kept, ...names]));
  return kept;
}

/** One group: its everyday settings, then the advanced ones behind a toggle (changed ones always show). */
function GroupView({
  group,
  changed,
  row,
  showAdvanced,
  onShowAdvanced,
}: {
  group: SettingGroup;
  changed: SettingDef[];
  row: (def: SettingDef) => ReactNode;
  /** Kept by the page, so each group remembers it while you switch between groups. */
  showAdvanced: boolean;
  onShowAdvanced: (show: boolean) => void;
}) {
  const advancedId = useId();
  const defs = SETTINGS.filter((s) => s.group === group);
  const basic = defs.filter((s) => !s.advanced);
  const advanced = defs.filter((s) => s.advanced);
  const kept = useKept(advanced.filter((s) => changed.includes(s)).map((s) => s.name));
  const shownAdvanced = showAdvanced ? advanced : advanced.filter((s) => kept.has(s.name));
  const hidden = advanced.length - shownAdvanced.length;
  return (
    <section className="settings-group" aria-label={groupOf(group).label}>
      <GroupHeader group={group} />
      <div className="setting-rows">{basic.map(row)}</div>
      {advanced.length > 0 && (
        <>
          {shownAdvanced.length > 0 && (
            <div id={advancedId} className="setting-rows advanced" aria-label="Advanced settings" role="group">
              {shownAdvanced.map(row)}
            </div>
          )}
          {(hidden > 0 || showAdvanced) && (
            <button
              type="button"
              className="link-button settings-advanced-toggle"
              aria-controls={shownAdvanced.length > 0 ? advancedId : undefined}
              aria-expanded={showAdvanced}
              onClick={() => onShowAdvanced(!showAdvanced)}
            >
              <Icon name={showAdvanced ? 'chevronUp' : 'chevronDown'} size={14} />
              {showAdvanced ? 'Hide advanced settings' : `Show ${plural(hidden, 'advanced setting')}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

/** Every setting set in the .conf, under its group, for a quick review. */
function ChangedOnly({
  changed,
  row,
  onShowGroup,
}: {
  changed: SettingDef[];
  row: (def: SettingDef) => ReactNode;
  onShowGroup: (group: SettingGroup) => void;
}) {
  const kept = useKept(changed.map((d) => d.name));
  const listed = SETTINGS.filter((d) => kept.has(d.name));
  if (listed.length === 0) {
    return (
      <div className="settings-empty">
        <Icon name="check" size={22} />
        <p className="muted">Nothing changed: every setting uses ZMK’s (or the board’s) default.</p>
      </div>
    );
  }
  return (
    <div className="settings-changed">
      <p className="muted small">
        {plural(changed.length, 'changed setting')}. Reset one to go back to its default; it leaves this list next time you open
        it.
      </p>
      {SETTING_GROUPS.filter((g) => listed.some((d) => d.group === g.id)).map((g) => (
        <section key={g.id} className="settings-group" aria-label={g.label}>
          <header className="settings-group-head compact">
            <span className="settings-group-icon">
              <Icon name={GROUP_ICONS[g.id]} size={16} />
            </span>
            <h3 className="grow">{g.label}</h3>
            <button
              type="button"
              className="link-button"
              aria-label={`Show all ${g.label} settings`}
              onClick={() => onShowGroup(g.id)}
            >
              All {g.label} settings →
            </button>
          </header>
          <div className="setting-rows">{listed.filter((d) => d.group === g.id).map(row)}</div>
        </section>
      ))}
    </div>
  );
}

function SettingRow({
  def,
  value,
  unavailable,
  onChange,
}: {
  def: SettingDef;
  value: SettingValue | undefined;
  /** Why this can't be turned on (a designed keyboard without the hardware); it can still be turned off. */
  unavailable?: string | undefined;
  onChange: (v: SettingValue | undefined) => void;
}) {
  const id = useId();
  const isSet = value !== undefined;
  const { type } = def;
  const unit = type.kind === 'int' ? type.unit : undefined;
  const common = { id, 'aria-describedby': `${id}-help` };

  let control: ReactNode;
  if (type.kind === 'bool') {
    const effective = value ?? def.default;
    // Always explicit: boards and shields can change defaults (nice_view turns the display on).
    control = (
      <Switch {...common} checked={effective === true} disabled={!!unavailable && effective !== true} onChange={onChange} />
    );
  } else if (type.kind === 'choice') {
    control = (
      <select
        {...common}
        className="input"
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        <option value="">Default ({describeDefault(def)})</option>
        {type.options.map((o) => (
          <option key={o.name} value={o.name}>
            {o.label}
          </option>
        ))}
      </select>
    );
  } else if (type.kind === 'int') {
    control = (
      <span className="setting-number">
        <NumberInput
          {...common}
          className="input"
          aria-label={`${def.label}${unit ? ` (${unit})` : ''}`}
          min={type.min}
          max={type.max}
          placeholder={def.default === undefined ? '' : String(def.default)}
          value={typeof value === 'number' ? value : undefined}
          onCommit={onChange}
        />
        {unit && <span className="setting-unit">{unit}</span>}
      </span>
    );
  } else {
    control = (
      <input
        {...common}
        className="input"
        maxLength={type.maxLength}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
      />
    );
  }

  return (
    <div className={`setting-row${isSet ? ' is-set' : ''}${unavailable ? ' unavailable' : ''}`} data-setting={def.name}>
      <div className="setting-text">
        <span className="setting-title">
          <label htmlFor={id}>{def.label}</label>
          {isSet && <span className="badge setting-changed">Changed</span>}
        </span>
        <span id={`${id}-help`} className="setting-help">
          {unavailable && <strong>{unavailable} </strong>}
          {def.help}
          {def.help && ' '}
          <span className="setting-default">Default: {describeDefault(def)}.</span>
        </span>
      </div>
      <div className="setting-control">
        {control}
        {unit === 'ms' && typeof value === 'number' && <span className="setting-readout">= {duration(value)}</span>}
        {isSet ? (
          <IconButton
            icon="reset"
            label={`Reset ${def.label} to default`}
            className="setting-reset"
            onClick={() => {
              // The button goes away with the change; keep keyboard focus on the setting itself.
              document.getElementById(id)?.focus();
              onChange(undefined);
            }}
          />
        ) : (
          <span className="setting-reset-space" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}

function RawPane({ config, dispatch, others }: Omit<SettingsViewProps, 'onPlaceUnlock'> & { others: string[] }) {
  return (
    <section className="settings-group" aria-label="Raw .conf">
      <header className="settings-group-head">
        <span className="settings-group-icon">
          <Icon name="code" size={20} />
        </span>
        <div>
          <h3>Raw .conf</h3>
          <p className="muted small">
            The whole <span className="mono">config/{config.keyboard}.conf</span>, including lines this page has no field for.
          </p>
        </div>
      </header>
      {others.length > 0 && (
        <div>
          <h4 className="settings-subhead">Other settings in the file</h4>
          <ul className="notes mono">
            {others.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      <RawConf key={generateKconfig(config.kconfig)} config={config} dispatch={dispatch} />
    </section>
  );
}

function RawConf({ config, dispatch }: Omit<SettingsViewProps, 'onPlaceUnlock'>) {
  const original = generateKconfig(config.kconfig);
  const [text, setText] = useState(original);
  return (
    <div className="raw-conf">
      <h4 className="settings-subhead">Edit as text</h4>
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
    </div>
  );
}
