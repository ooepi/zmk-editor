import { BEHAVIOR_GROUPS } from '../catalog/behaviors.ts';
import { KEYCODE_CATEGORIES, searchKeycodes, type Keycode } from '../catalog/keycodes.ts';
import { searchTiles, type BehaviorTile } from './palette.ts';

export type PaletteSection =
  | { id: string; title: string; kind: 'keys'; keycodes: Keycode[] }
  | { id: string; title: string; kind: 'behaviors'; tiles: BehaviorTile[] };

/**
 * The palette's sections for a search. With no query: every key category, then every
 * behavior group, in catalog order. With a query: one "Keys" section of ranked matches,
 * then the matching behavior groups. Empty sections are left out.
 */
export function paletteSections(query: string, tiles: BehaviorTile[]): PaletteSection[] {
  const searching = query.trim() !== '';
  const keycodes = searchKeycodes(query);
  const keySections: PaletteSection[] = searching
    ? [{ id: 'keys', title: 'Keys', kind: 'keys', keycodes }]
    : KEYCODE_CATEGORIES.map((c) => ({
        id: `keys-${c.id}`,
        title: c.label,
        kind: 'keys',
        keycodes: keycodes.filter((k) => k.category === c.id),
      }));
  const shown = searchTiles(tiles, query);
  const behaviorSections: PaletteSection[] = BEHAVIOR_GROUPS.map((g) => ({
    id: `behaviors-${g.id}`,
    title: g.label,
    kind: 'behaviors',
    tiles: shown.filter((t) => t.group === g.id),
  }));
  return [...keySections, ...behaviorSections].filter((s) => (s.kind === 'keys' ? s.keycodes.length : s.tiles.length) > 0);
}
