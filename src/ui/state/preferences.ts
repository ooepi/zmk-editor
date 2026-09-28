import { useSyncExternalStore } from 'react';
import type { PaletteItem } from '../../core/keymap/palette.ts';

/** Per-browser preferences shared across components. */
export interface Preferences {
  /** zmk-unicode alias languages to show first (the Finnish/Swedish preset sets `swedish`). */
  unicodeLanguages: string[];
  /** Chosen layout variant per keyboard, for keyboards with several (e.g. 60% ANSI/ISO). */
  layouts: Record<string, string>;
  /** How each Pro Micro diagram is drawn (key: 'left', 'right' or 'one'); wiring plans are often drawn from below. */
  pinoutViews: Record<string, 'top' | 'bottom'>;
  /** Palette items placed most recently, newest first. */
  recent: PaletteItem[];
}

const STORAGE_KEY = 'zmk-editor.preferences.v1';
const DEFAULTS: Preferences = { unicodeLanguages: [], layouts: {}, pinoutViews: {}, recent: [] };

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
    return { ...DEFAULTS, ...stored, recent: validRecent(stored.recent) };
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
