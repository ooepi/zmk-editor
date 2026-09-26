import { useSyncExternalStore } from 'react';

/** Per-browser preferences shared across components. */
export interface Preferences {
  /** zmk-unicode alias languages to show first (the Finnish/Swedish preset sets `swedish`). */
  unicodeLanguages: string[];
  /** Chosen layout variant per keyboard, for keyboards with several (e.g. 60% ANSI/ISO). */
  layouts: Record<string, string>;
}

const STORAGE_KEY = 'zmk-editor.preferences.v1';
const DEFAULTS: Preferences = { unicodeLanguages: [], layouts: {} };

function load(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Preferences>) } : DEFAULTS;
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
