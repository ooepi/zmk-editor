import type { ZmkConfig } from '../../core/config.ts';
import { addLayer, deleteLayer, moveLayer, renameLayer, setBinding } from '../../core/keymap/edit.ts';
import { setSensorBinding } from '../../core/keymap/sensorEdit.ts';
import type { Binding, KeymapModel } from '../../core/keymap/model.ts';

const HISTORY_LIMIT = 200;

export interface EditorState {
  config: ZmkConfig;
  /** Notes from the last import (things kept as raw text, …). */
  warnings: string[];
  layer: number;
  /** Selected key, or null. At most one of `key` and `sensor` is set. */
  key: number | null;
  /** Selected encoder, or null. */
  sensor: number | null;
  past: ZmkConfig[];
  future: ZmkConfig[];
  /** A one-off message, e.g. combos removed with a layer. */
  notice: string | null;
}

export type EditorAction =
  | { type: 'load'; config: ZmkConfig; warnings: string[] }
  | { type: 'selectLayer'; index: number }
  | { type: 'selectKey'; index: number | null }
  | { type: 'selectSensor'; index: number | null }
  | { type: 'setBinding'; binding: Binding }
  | { type: 'setSensorBinding'; binding: Binding }
  /** Any other keymap change (behaviors, combos, macros), recorded for undo. */
  | { type: 'edit'; keymap: KeymapModel; notice?: string }
  /** Changes beyond the keymap (modules, ZMK version), recorded for undo. */
  | { type: 'editConfig'; config: ZmkConfig; notice?: string }
  | { type: 'addLayer'; name: string }
  | { type: 'renameLayer'; index: number; name: string }
  | { type: 'moveLayer'; from: number; to: number }
  | { type: 'deleteLayer'; index: number }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'notify'; notice: string }
  | { type: 'dismissNotice' };

export function initialState(config: ZmkConfig, warnings: string[] = []): EditorState {
  return { config, warnings, layer: 0, key: null, sensor: null, past: [], future: [], notice: null };
}

/** Records the current config in history and switches to a new keymap. */
function commit(state: EditorState, keymap: KeymapModel, patch: Partial<EditorState> = {}): EditorState {
  return {
    ...state,
    ...patch,
    config: { ...state.config, keymap },
    past: [...state.past, state.config].slice(-HISTORY_LIMIT),
    future: [],
  };
}

function clampLayer(index: number, config: ZmkConfig): number {
  return Math.max(0, Math.min(index, config.keymap.layers.length - 1));
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const { keymap } = state.config;
  switch (action.type) {
    case 'load':
      return initialState(action.config, action.warnings);
    case 'selectLayer':
      return { ...state, layer: clampLayer(action.index, state.config) };
    case 'selectKey':
      return { ...state, key: action.index, sensor: null };
    case 'selectSensor':
      return { ...state, sensor: action.index, key: null };
    case 'setBinding':
      if (state.key === null) return state;
      return commit(state, setBinding(keymap, state.layer, state.key, action.binding));
    case 'setSensorBinding':
      if (state.sensor === null) return state;
      return commit(state, setSensorBinding(keymap, state.layer, state.sensor, action.binding));
    case 'edit':
      return commit(state, action.keymap, { notice: action.notice ?? null });
    case 'editConfig':
      return {
        ...state,
        config: action.config,
        past: [...state.past, state.config].slice(-HISTORY_LIMIT),
        future: [],
        notice: action.notice ?? null,
        layer: clampLayer(state.layer, action.config),
      };
    case 'addLayer': {
      const next = addLayer(keymap, action.name);
      return commit(state, next, { layer: next.layers.length - 1 });
    }
    case 'renameLayer':
      return commit(state, renameLayer(keymap, action.index, action.name));
    case 'moveLayer': {
      if (action.to < 0 || action.to >= keymap.layers.length) return state;
      const layer = state.layer === action.from ? action.to : state.layer;
      return commit(state, moveLayer(keymap, action.from, action.to), { layer });
    }
    case 'deleteLayer': {
      if (keymap.layers.length <= 1) return state;
      const { model, removedCombos } = deleteLayer(keymap, action.index);
      const notice =
        removedCombos.length > 0
          ? `Removed combo${removedCombos.length > 1 ? 's' : ''} ${removedCombos.join(', ')}: ${removedCombos.length > 1 ? 'they' : 'it'} only worked on the deleted layer.`
          : null;
      const layer = Math.min(state.layer, model.layers.length - 1);
      return commit(state, model, { layer, notice });
    }
    case 'undo': {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        ...state,
        config: previous,
        past: state.past.slice(0, -1),
        future: [state.config, ...state.future],
        layer: clampLayer(state.layer, previous),
      };
    }
    case 'redo': {
      const [next, ...future] = state.future;
      if (!next) return state;
      return { ...state, config: next, past: [...state.past, state.config], future, layer: clampLayer(state.layer, next) };
    }
    case 'notify':
      return { ...state, notice: action.notice };
    case 'dismissNotice':
      return { ...state, notice: null };
  }
}
