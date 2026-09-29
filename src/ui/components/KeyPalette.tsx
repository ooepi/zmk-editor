import { useMemo, useRef, useState, type DragEvent } from 'react';
import {
  formatKeyExpression,
  keyExpressionLabel,
  MODIFIER_FUNCTIONS,
  preferredName,
  type Keycode,
  type ModifierFunction,
} from '../../core/catalog/keycodes.ts';
import { formatBinding } from '../../core/keymap/bindings.ts';
import { describeBinding, displayContext, type KeycapLabel } from '../../core/keymap/display.ts';
import type { KeymapModel } from '../../core/keymap/model.ts';
import { behaviorTiles, type PaletteItem } from '../../core/keymap/palette.ts';
import { paletteSections, sectionInView } from '../../core/keymap/paletteSections.ts';
import { sensorCount } from '../../core/keymap/sensorEdit.ts';
import { setPaletteDrag } from '../dnd.ts';
import { setPreferences, usePreferences } from '../state/preferences.ts';
import { CategoryRail, type RailEntry } from './palette/CategoryRail.tsx';
import { ModifierBar } from './palette/ModifierBar.tsx';
import { IconButton } from './ui/IconButton.tsx';
import { PaletteStatus } from './palette/PaletteStatus.tsx';

interface KeyPaletteProps {
  keymap: KeymapModel;
  /** The tile being placed by clicking keys, if any. */
  armed: PaletteItem | null;
  selection: readonly number[];
  /** A tile was clicked. */
  onPick: (item: PaletteItem) => void;
  /** Stop placing the armed tile. */
  onDisarm: () => void;
}

const TRANSPARENT: PaletteItem = { kind: 'binding', binding: { behavior: 'trans', params: [] } };
const NONE: PaletteItem = { kind: 'binding', binding: { behavior: 'none', params: [] } };

const sameItem = (a: PaletteItem | null, b: PaletteItem) => a !== null && JSON.stringify(a) === JSON.stringify(b);

/** Transparent and None, with the words a search can find them by. */
const SPECIALS = [
  { item: TRANSPARENT, label: { main: '▽', sub: 'Trans' }, name: 'Transparent', words: 'transparent trans ▽ lower layer', title: 'Transparent: uses the binding of the next active layer below.', kind: 'trans' },
  { item: NONE, label: { main: '✕', sub: 'None' }, name: 'None', words: 'none nothing ✕ blank disabled', title: 'None: does nothing.', kind: 'none' },
];

/** How long a rail jump's smooth scroll may take before the scroll-spy takes over again. */
const JUMP_SETTLE_MS = 800;

/** Keys and behaviors laid out as tiles in one list: drag one onto a key, or click it and then keys. */
export function KeyPalette({ keymap, armed, selection, onPick, onDisarm }: KeyPaletteProps) {
  const [query, setQuery] = useState('');
  const [mods, setMods] = useState<ModifierFunction[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  /** The section last jumped to from the rail, and until when its smooth scroll is left alone. */
  const jumped = useRef<{ id: string; until: number } | null>(null);
  const { recent, paletteCollapsed: collapsed } = usePreferences();
  const hasEncoders = sensorCount(keymap) > 0;
  const searching = query.trim() !== '';

  const tiles = useMemo(
    () => behaviorTiles(keymap).filter((t) => t.binding.behavior !== 'trans' && t.binding.behavior !== 'none'),
    [keymap],
  );
  const sections = useMemo(() => paletteSections(query, tiles), [query, tiles]);
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
  const showRecent = recentTiles.length > 0 && !searching;

  const railEntries: RailEntry[] = [
    ...(showRecent ? [{ id: 'recent', title: 'Recent', kind: 'Recent' as const }] : []),
    ...sections.map((s) => ({ id: s.id, title: s.title, kind: s.kind === 'keys' ? ('Keys' as const) : ('Behaviors' as const) })),
  ];

  const jump = (id: string) => {
    jumped.current = { id, until: performance.now() + JUMP_SETTLE_MS };
    scroller.current?.querySelector(`[data-section="${id}"]`)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    setCurrent(id);
  };

  // Highlight the section at the top of the list while scrolling, but not while a jump is still scrolling there.
  const onScroll = () => {
    const box = scroller.current;
    if (!box || (jumped.current && performance.now() < jumped.current.until)) return;
    const tops = [...box.querySelectorAll<HTMLElement>('[data-section]')].map((el) => ({
      id: el.dataset.section ?? '',
      top: el.getBoundingClientRect().top,
    }));
    const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 2;
    setCurrent(sectionInView(tops, box.getBoundingClientRect().top, atBottom, jumped.current?.id ?? null));
  };

  // A new search starts at the top of the list, with no category highlighted.
  const search = (text: string) => {
    setQuery(text);
    setCurrent(null);
    jumped.current = null;
    if (scroller.current) scroller.current.scrollTop = 0;
  };

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const specials = SPECIALS.filter((s) => words.every((w) => s.words.includes(w)));

  const toggleMod = (mod: ModifierFunction) =>
    setMods((held) => (held.includes(mod) ? held.filter((m) => m !== mod) : [...held, mod]));

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

  // With modifiers held, the tile still shows the key big; the modifiers go on the small line, in colour.
  const modsText = MODIFIER_FUNCTIONS.filter((m) => mods.includes(m.id))
    .map((m) => m.label)
    .join('+');
  const keyTile = (keycode: Keycode) => {
    const token = formatKeyExpression({ mods, key: preferredName(keycode) });
    const full = mods.length > 0 ? keyExpressionLabel(token) : keycode.label;
    return tile(
      { kind: 'keycode', token },
      { main: keycode.label, sub: mods.length > 0 ? modsText : token },
      `${full} (${token})`,
      `${keycode.description}: ${full} (${token})`,
      mods.length > 0 ? 'mods' : 'key',
    );
  };

  const armedName = (() => {
    if (!armed) return null;
    if (armed.kind === 'keycode') return keyExpressionLabel(armed.token);
    const special = SPECIALS.find((s) => sameItem(armed, s.item));
    if (special) return special.name;
    const label = describeBinding(armed.binding, displayContext(keymap));
    return label.sub ? `${label.main} (${label.sub})` : label.main;
  })();

  return (
    <section className={`palette${collapsed ? ' collapsed' : ''}`} aria-label="Key palette">
      <div className="palette-head">
        <PaletteStatus armed={armedName ? { name: armedName } : null} selection={selection} hasEncoders={hasEncoders} onStop={onDisarm} />
        <IconButton
          icon={collapsed ? 'chevronUp' : 'chevronDown'}
          label={collapsed ? 'Show palette' : 'Hide palette'}
          aria-expanded={!collapsed}
          onClick={() => setPreferences({ paletteCollapsed: !collapsed })}
        />
      </div>
      {!collapsed && (
        <div className="palette-body">
          <CategoryRail entries={railEntries} current={current} onJump={jump} />
          <div className="palette-main">
            <div className="palette-tools">
              <input
                className="input palette-search"
                type="search"
                placeholder="Search keys and behaviors: a, esc, volume, bluetooth…"
                aria-label="Search the palette"
                value={query}
                onChange={(e) => search(e.target.value)}
              />
              <ModifierBar mods={mods} onToggle={toggleMod} onClear={() => setMods([])} />
            </div>
            <div className="palette-scroll" role="region" aria-label="Palette tiles" ref={scroller} onScroll={onScroll}>
              {specials.length > 0 && (
                <div className="palette-special" role="group" aria-label="Special">
                  {specials.map((s) => tile(s.item, s.label, s.name, s.title, s.kind))}
                </div>
              )}
              {showRecent && (
                <div className="palette-group" id="palette-recent" data-section="recent">
                  <div className="palette-group-head">
                    <h3 className="palette-group-title">Recent</h3>
                    <button type="button" className="link-button small" aria-label="Clear recently used" onClick={() => setPreferences({ recent: [] })}>
                      Clear
                    </button>
                  </div>
                  <div className="palette-tiles" role="group" aria-label="Recently used">
                    {recentTiles.map((r) => tile(r.item, r.label, `recent ${r.name}`, r.title, r.kind))}
                  </div>
                </div>
              )}
              {sections.map((section) => (
                <div key={section.id} className="palette-group" id={`palette-${section.id}`} data-section={section.id}>
                  <h3 className="palette-group-title">{section.title}</h3>
                  <div className="palette-tiles" role="group" aria-label={section.title}>
                    {section.kind === 'keys'
                      ? section.keycodes.map(keyTile)
                      : section.tiles.map((t) =>
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
              ))}
              {searching && sections.length === 0 && specials.length === 0 && <p className="muted">Nothing matches “{query.trim()}”.</p>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
