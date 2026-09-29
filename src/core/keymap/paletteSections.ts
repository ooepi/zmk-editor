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
    // "Keys" is taken by the key search results; say what this group is.
    title: g.id === 'keys' ? 'Key behaviors' : g.label,
    kind: 'behaviors',
    tiles: shown.filter((t) => t.group === g.id),
  }));
  return [...keySections, ...behaviorSections].filter((s) => (s.kind === 'keys' ? s.keycodes.length : s.tiles.length) > 0);
}

/** How far past the list's top edge a section may start and still count as reached (rounding, scroll padding). */
const REACHED_SLACK = 12;

/**
 * Which section a scrolled list is showing: the last one whose top (in viewport
 * pixels) has reached the list's top. At the bottom of the list the last sections
 * can't reach the top, so the one just jumped to, or else the last one, wins.
 */
export function sectionInView(
  tops: readonly { id: string; top: number }[],
  listTop: number,
  atBottom: boolean,
  jumped: string | null,
): string | null {
  if (atBottom) return jumped ?? tops.at(-1)?.id ?? null;
  let inView: string | null = null;
  for (const { id, top } of tops) if (top <= listTop + REACHED_SLACK) inView = id;
  return inView;
}
