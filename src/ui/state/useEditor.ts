import { useEffect, useReducer, type Dispatch } from 'react';
import type { ZmkConfig } from '../../core/config.ts';
import { demoConfig } from './demo.ts';
import { editorReducer, initialState, type EditorAction, type EditorState } from './editorReducer.ts';

const STORAGE_KEY = 'zmk-editor.config.v1';

function loadStored(): ZmkConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const config = (parsed as { config?: ZmkConfig } | null)?.config;
    return config && Array.isArray(config.keymap?.layers) && config.keymap.layers.length > 0 ? config : null;
  } catch {
    return null;
  }
}

function loadInitial(): EditorState {
  const stored = loadStored();
  if (stored) return initialState(stored);
  const demo = demoConfig();
  return initialState(demo.config, demo.warnings);
}

/** Whether this browser has a config from an earlier visit (else the editor opens on the demo). */
export function hasStoredConfig(): boolean {
  return loadStored() !== null;
}

export function clearStoredConfig(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored, or storage unavailable.
  }
}

/** Editor state; the config is saved in this browser after every change. */
export function useEditor(): [EditorState, Dispatch<EditorAction>] {
  const [state, dispatch] = useReducer(editorReducer, undefined, loadInitial);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ config: state.config }));
    } catch {
      // Storage full or unavailable: the editor still works for this session.
    }
  }, [state.config]);
  return [state, dispatch];
}
