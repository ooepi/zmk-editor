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
import { paletteSections } from '../../core/keymap/paletteSections.ts';
import { sensorCount } from '../../core/keymap/sensorEdit.ts';
import { setPaletteDrag } from '../dnd.ts';
import { setPreferences, usePreferences } from '../state/preferences.ts';
import { CategoryRail, type RailEntry } from './palette/CategoryRail.tsx';
import { ModifierBar } from './palette/ModifierBar.tsx';
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

/** Keys and behaviors laid out as tiles in one list: drag one onto a key, or click it and then keys. */
export function KeyPalette({ keymap, armed, selection, onPick, onDisarm }: KeyPaletteProps) {
  const [query, setQuery] = useState('');
  const [mods, setMods] = useState<ModifierFunction[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const { recent } = usePreferences();
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
    document.getElementById(`palette-${id}`)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    setCurrent(id);
  };

  // Highlight the section at the top of the list while scrolling.
  const onScroll = () => {
    const box = scroller.current;
    if (!box) return;
    let inView: string | null = null;
    for (const el of box.querySelectorAll<HTMLElement>('[data-section]')) {
      if (el.offsetTop - box.offsetTop <= box.scrollTop + 8) inView = el.dataset.section ?? null;
    }
    setCurrent(inView);
  };

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

  const armedName = armed && (armed.kind === 'keycode' ? keyExpressionLabel(armed.token) : describeBinding(armed.binding, displayContext(keymap)).main);

  return (
    <section className="palette" aria-label="Key palette">
      <div className="palette-head">
        <PaletteStatus armed={armedName ? { name: armedName } : null} selection={selection} hasEncoders={hasEncoders} onStop={onDisarm} />
      </div>
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
              onChange={(e) => setQuery(e.target.value)}
            />
            <ModifierBar mods={mods} onToggle={toggleMod} onClear={() => setMods([])} />
          </div>
          <div className="palette-scroll" ref={scroller} onScroll={onScroll}>
            {!searching && (
              <div className="palette-special" role="group" aria-label="Special">
                {tile(TRANSPARENT, { main: '▽', sub: 'Trans' }, 'Transparent', 'Transparent: uses the binding of the next active layer below.', 'trans')}
                {tile(NONE, { main: '✕', sub: 'None' }, 'None', 'None: does nothing.', 'none')}
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
            {searching && sections.length === 0 && <p className="muted">Nothing matches “{query.trim()}”.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
