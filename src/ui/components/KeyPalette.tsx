import { useMemo, useState, type DragEvent } from 'react';
import { BEHAVIOR_GROUPS } from '../../core/catalog/behaviors.ts';
import {
  formatKeyExpression,
  KEYCODE_CATEGORIES,
  keyExpressionLabel,
  MODIFIER_FUNCTIONS,
  preferredName,
  searchKeycodes,
  type KeycodeCategory,
  type ModifierFunction,
} from '../../core/catalog/keycodes.ts';
import { formatBinding } from '../../core/keymap/bindings.ts';
import { describeBinding, displayContext, type KeycapLabel } from '../../core/keymap/display.ts';
import type { KeymapModel } from '../../core/keymap/model.ts';
import { behaviorTiles, searchTiles, type PaletteItem } from '../../core/keymap/palette.ts';
import { sensorCount } from '../../core/keymap/sensorEdit.ts';
import { setPaletteDrag } from '../dnd.ts';
import { setPreferences, usePreferences } from '../state/preferences.ts';
import { HelpLink } from '../help/HelpLink.tsx';

interface KeyPaletteProps {
  keymap: KeymapModel;
  /** The tile being placed by clicking keys, if any. */
  armed: PaletteItem | null;
  selection: readonly number[];
  /** A tile was clicked. */
  onPick: (item: PaletteItem) => void;
}

type Tab = 'keys' | 'behaviors';

const TRANSPARENT: PaletteItem = { kind: 'binding', binding: { behavior: 'trans', params: [] } };
const NONE: PaletteItem = { kind: 'binding', binding: { behavior: 'none', params: [] } };

const sameItem = (a: PaletteItem | null, b: PaletteItem) => a !== null && JSON.stringify(a) === JSON.stringify(b);

/** Keys and behaviors laid out as tiles: drag one onto a key, or click it and then keys. */
export function KeyPalette({ keymap, armed, selection, onPick }: KeyPaletteProps) {
  const [tab, setTab] = useState<Tab>('keys');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<KeycodeCategory | undefined>(undefined);
  const [mods, setMods] = useState<ModifierFunction[]>([]);
  const [behaviorQuery, setBehaviorQuery] = useState('');
  const { recent } = usePreferences();
  const hasEncoders = sensorCount(keymap) > 0;

  const keycodes = useMemo(() => searchKeycodes(query, category), [query, category]);
  const tiles = useMemo(
    () => behaviorTiles(keymap).filter((t) => t.binding.behavior !== 'trans' && t.binding.behavior !== 'none'),
    [keymap],
  );
  const shownTiles = useMemo(() => searchTiles(tiles, behaviorQuery), [tiles, behaviorQuery]);
  const recentTiles = useMemo(() => {
    const ctx = displayContext(keymap);
    return recent.map((item) => {
      if (item.kind === 'keycode') {
        const label = keyExpressionLabel(item.token);
        return { item, label: { main: label, sub: item.token }, name: `${label} (${item.token})`, title: item.token, kind: 'key' };
      }
      const label = describeBinding(item.binding, ctx);
      const name = label.sub ? `${label.main} (${label.sub})` : label.main;
      return { item, label, name, title: formatBinding(item.binding), kind: label.kind };
    });
  }, [recent, keymap]);

  const toggleMod = (mod: ModifierFunction) =>
    setMods(mods.includes(mod) ? mods.filter((m) => m !== mod) : [...mods, mod]);

  const tile = (item: PaletteItem, label: Pick<KeycapLabel, 'main' | 'sub'>, name: string, title: string, kind = 'key') => {
    const active = sameItem(armed, item);
    return (
      <button
        key={JSON.stringify(item)}
        type="button"
        className={`palette-tile kind-${kind}${active ? ' armed' : ''}`}
        draggable
        aria-pressed={active}
        aria-label={`Place ${name}`}
        title={title}
        onDragStart={(event: DragEvent) => setPaletteDrag(event.dataTransfer, item)}
        onClick={() => onPick(item)}
      >
        <span className="palette-tile-main">{label.main}</span>
        {label.sub && <span className="palette-tile-sub">{label.sub}</span>}
      </button>
    );
  };

  const hint = armed
    ? 'Click keys to place the highlighted tile · Esc or click the tile again to stop'
    : selection.length > 1
      ? `Click a tile to put it on the ${selection.length} selected keys, or drag it onto any key`
      : selection.length === 1
        ? `Click a tile to put it on key ${selection[0]}, or drag it onto any key`
      : 'Drag a tile onto a key, or click a tile and then keys · Drag keys onto each other to swap (hold Alt to copy)' +
        (hasEncoders ? " · Drop keys on an encoder's ↺ or ↻ side" : '');

  return (
    <section className="palette" aria-label="Key palette">
      <div className="palette-bar">
        <div className="segmented" role="group" aria-label="Palette sections">
          {(['keys', 'behaviors'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`segment${tab === t ? ' active' : ''}`}
              aria-pressed={tab === t}
              onClick={() => setTab(t)}
            >
              {t === 'keys' ? 'Keys' : 'Behaviors'}
            </button>
          ))}
        </div>
        <div className="palette-fixed">
          {tile(TRANSPARENT, { main: '▽' }, 'Transparent', 'Transparent: uses the binding of the next active layer below.', 'trans')}
          {tile(NONE, { main: '✕' }, 'None', 'None: does nothing.', 'none')}
        </div>
        <p className="palette-hint muted small">
          {hint} <HelpLink to="palette" />
        </p>
      </div>

      {recentTiles.length > 0 && (
        <div className="palette-recent">
          <span className="palette-recent-title">Recent</span>
          <div className="palette-tiles palette-recent-tiles" role="group" aria-label="Recently used">
            {recentTiles.map((r) => tile(r.item, r.label, `recent ${r.name}`, r.title, r.kind))}
          </div>
          <button
            type="button"
            className="link-button small"
            aria-label="Clear recently used"
            onClick={() => setPreferences({ recent: [] })}
          >
            Clear
          </button>
        </div>
      )}

      {tab === 'keys' ? (
        <>
          <div className="palette-filters">
            <input
              className="input palette-search"
              type="search"
              placeholder="Search keys: a, esc, volume, !…"
              aria-label="Search the palette"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="chips" role="group" aria-label="Palette key categories">
              {KEYCODE_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`chip${category === c.id ? ' active' : ''}`}
                  aria-pressed={category === c.id}
                  onClick={() => setCategory(category === c.id ? undefined : c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="chips" role="group" aria-label="Hold with placed keys">
              {MODIFIER_FUNCTIONS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`chip${mods.includes(m.id) ? ' active' : ''}`}
                  aria-pressed={mods.includes(m.id)}
                  aria-label={`Hold ${m.name} with placed keys`}
                  title={`Hold ${m.name} with the placed key (${m.id})`}
                  onClick={() => toggleMod(m.id)}
                >
                  +{m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="palette-tiles" role="group" aria-label="Keys">
            {keycodes.map((keycode) => {
              const token = formatKeyExpression({ mods, key: preferredName(keycode) });
              const label = mods.length > 0 ? keyExpressionLabel(token) : keycode.label;
              return tile({ kind: 'keycode', token }, { main: label, sub: token }, `${label} (${token})`, `${keycode.description} (${token})`);
            })}
            {keycodes.length === 0 && <p className="muted">No keys match.</p>}
          </div>
        </>
      ) : (
        <>
          <div className="palette-filters">
            <input
              className="input palette-search"
              type="search"
              placeholder="Search behaviors: bluetooth, nav, boot…"
              aria-label="Search behaviors"
              value={behaviorQuery}
              onChange={(e) => setBehaviorQuery(e.target.value)}
            />
          </div>
          <div className="palette-groups">
            {shownTiles.length === 0 && <p className="muted">No behaviors match.</p>}
            {BEHAVIOR_GROUPS.map((group) => {
              const inGroup = shownTiles.filter((t) => t.group === group.id);
              if (inGroup.length === 0) return null;
              return (
                <div key={group.id} className="palette-group">
                  <h3 className="palette-group-title">{group.label}</h3>
                  <div className="palette-tiles" role="group" aria-label={group.label}>
                    {inGroup.map((t) =>
                      tile(
                        { kind: 'binding', binding: t.binding },
                        t.label,
                        t.label.sub ? `${t.label.main} (${t.label.sub})` : t.label.main,
                        t.title,
                        t.label.kind,
                      ),
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
