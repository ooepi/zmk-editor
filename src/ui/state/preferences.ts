import { useSyncExternalStore } from 'react';
import type { PaletteItem } from '../../core/keymap/palette.ts';

/** Per-browser preferences shared across components. */
export interface Preferences {
  /** zmk-unicode alias languages to show first (the Finnish/Swedish preset sets `swedish`). */
  unicodeLanguages: string[];
  /** Chosen layout variant per keyboard, for keyboards with several (e.g. 60% ANSI/ISO). */
  layouts: Record<string, string>;
  /** How each controller pinout is drawn (key: 'left', 'right' or 'one'); wiring plans are often drawn from below. */
  pinoutViews: Record<string, 'top' | 'bottom'>;
  /** In the wiring step, picking a pin for a field selects the next field in its list. */
  pinFillInOrder: boolean;
  /** Palette items placed most recently, newest first. */
  recent: PaletteItem[];
  /** The key palette folded down to its status line, so the keyboard gets the room. */
  paletteCollapsed: boolean;
  /** The palette's height in px, dragged by its top edge; null for the default. */
  paletteHeight: number | null;
  /** Dots behind the keyboard on the Keymap tab. */
  canvasGrid: boolean;
  /** The first-visit "Get started" card was answered or dismissed. */
  welcomed: boolean;
  /** This browser's first visit showed the card and it's still unanswered (it survives a reload). */
  welcomePending: boolean;
}

const STORAGE_KEY = 'zmk-editor.preferences.v1';
const DEFAULTS: Preferences = {
  unicodeLanguages: [],
  layouts: {},
  pinoutViews: {},
  pinFillInOrder: false,
  recent: [],
  paletteCollapsed: false,
  paletteHeight: null,
  canvasGrid: false,
  welcomed: false,
  welcomePending: false,
};

/** Drops recent items that aren't shaped like palette items (hand-edited or older storage). */
function validRecent(items: unknown): PaletteItem[] {
  if (!Array.isArray(items)) return [];
  return items.filter((item: Partial<PaletteItem> | null): item is PaletteItem => {
    if (item?.kind === 'keycode') return typeof item.token === 'string';
    if (item?.kind === 'binding') return typeof item.binding?.behavior === 'string' && Array.isArray(item.binding.params);
    return false;
  });
}

function load(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const stored = JSON.parse(raw) as Partial<Preferences>;
    return {
      ...DEFAULTS,
      ...stored,
      recent: validRecent(stored.recent),
      paletteCollapsed: stored.paletteCollapsed === true,
      paletteHeight: typeof stored.paletteHeight === 'number' && Number.isFinite(stored.paletteHeight) ? stored.paletteHeight : null,
      canvasGrid: stored.canvasGrid === true,
      pinFillInOrder: stored.pinFillInOrder === true,
      welcomed: stored.welcomed === true,
      welcomePending: stored.welcomePending === true,
    };
  } catch {
    return DEFAULTS;
  }
}

let current = load();
const listeners = new Set<() => void>();

export function setPreferences(patch: Partial<Preferences>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Storage unavailable: keep the preference for this session.
  }
  listeners.forEach((listener) => listener());
}

/** Re-reads storage; for tests that clear localStorage between runs. */
export function reloadPreferences(): void {
  current = load();
  listeners.forEach((listener) => listener());
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
