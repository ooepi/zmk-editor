import type { ZmkConfig } from '../../core/config.ts';
import { addLayer, copyBinding, deleteLayer, moveLayer, renameLayer, setBinding, swapBindings } from '../../core/keymap/edit.ts';
import { applyPaletteItem, applyToEncoder, type EncoderDirection, type PaletteItem } from '../../core/keymap/palette.ts';
import { copyKeys, pasteKeys, type KeyClipboard } from '../../core/keymap/clipboard.ts';
import { setSensorBinding } from '../../core/keymap/sensorEdit.ts';
import type { Binding, KeymapModel } from '../../core/keymap/model.ts';

const HISTORY_LIMIT = 200;

export interface EditorState {
  config: ZmkConfig;
  /** Notes from the last import (things kept as raw text, …). */
  warnings: string[];
  layer: number;
  /** The key being edited: set only when exactly one key is selected. At most one of `key` and `sensor` is set. */
  key: number | null;
  /** Every selected key, in the order they were selected. */
  selection: number[];
  /** Keys copied with Ctrl+C / Ctrl+X; not part of undo history. */
  clipboard: KeyClipboard | null;
  /** Selected encoder, or null. */
  sensor: number | null;
  past: ZmkConfig[];
  future: ZmkConfig[];
  /** A one-off message, e.g. combos removed with a layer. */
  notice: string | null;
  /** The notice is a short confirmation that clears itself after a few seconds. */
  noticeTransient: boolean;
  /** Counts notify actions, so the same short confirmation twice in a row restarts its timer. */
  noticeSeq: number;
}

export type EditorAction =
  | { type: 'load'; config: ZmkConfig; warnings: string[] }
  | { type: 'selectLayer'; index: number }
  | { type: 'selectKey'; index: number | null }
  /** Ctrl/Shift-click: adds a key to the selection or removes it. */
  | { type: 'toggleKey'; index: number }
  /** Box select and Ctrl+A. */
  | { type: 'selectKeys'; indices: number[]; additive: boolean }
  | { type: 'selectSensor'; index: number | null }
  | { type: 'setBinding'; binding: Binding }
  | { type: 'setSensorBinding'; binding: Binding }
  /** Drops a palette item on a key of the current layer and selects it. */
  | { type: 'placeOnKey'; index: number; item: PaletteItem }
  /** Key → key drag on the current layer; selects `to`. */
  | { type: 'swapKeys'; from: number; to: number }
  /** Copies `from` onto `to`; `from` is on `fromLayer` when given (a drag from another layer). */
  | { type: 'copyKey'; from: number; to: number; fromLayer?: number }
  /** Drops a palette item on one direction of an encoder on the current layer, and selects it. */
  | { type: 'placeOnEncoder'; index: number; direction: EncoderDirection; item: PaletteItem }
  /** Puts a palette item on every selected key. */
  | { type: 'placeOnSelection'; item: PaletteItem }
  | { type: 'copyKeys' }
  | { type: 'cutKeys' }
  | { type: 'pasteKeys' }
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
  | { type: 'notify'; notice: string; transient?: boolean }
  | { type: 'dismissNotice' };

export function initialState(config: ZmkConfig, warnings: string[] = []): EditorState {
  return {
    config,
    warnings,
    layer: 0,
    key: null,
    selection: [],
    clipboard: null,
    sensor: null,
    past: [],
    future: [],
    notice: null,
    noticeTransient: false,
    noticeSeq: 0,
  };
}

/** The state fields for a new key selection; `key` follows it. */
function select(indices: number[]): Pick<EditorState, 'key' | 'selection' | 'sensor'> {
  const selection = [...new Set(indices)];
  return { selection, key: selection.length === 1 ? (selection[0] ?? null) : null, sensor: null };
}

/** Sets every given key of the current layer from its current binding. */
function editKeys(keymap: KeymapModel, layer: number, indices: number[], change: (binding: Binding) => Binding): KeymapModel {
  const bindings = keymap.layers[layer]?.bindings ?? [];
  return indices.reduce((model, index) => {
    const binding = bindings[index];
    return binding ? setBinding(model, layer, index, change(binding)) : model;
  }, keymap);
}

const TRANSPARENT: Binding = { behavior: 'trans', params: [] };

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
  const next = reduce(state, action);
  // A notice from a transient notify clears itself; any other new notice stays. An action that
  // leaves the notice alone keeps its kind.
  const noticeTransient =
    action.type === 'notify'
      ? action.transient === true
      : next.notice === state.notice
        ? state.noticeTransient
        : false;
  const noticeSeq = action.type === 'notify' ? state.noticeSeq + 1 : state.noticeSeq;
  if (next === state && noticeSeq === state.noticeSeq) return next;
  return next.noticeTransient === noticeTransient && next.noticeSeq === noticeSeq ? next : { ...next, noticeTransient, noticeSeq };
}

function reduce(state: EditorState, action: EditorAction): EditorState {
  const { keymap } = state.config;
  switch (action.type) {
    case 'load':
      return initialState(action.config, action.warnings);
    case 'selectLayer':
      return { ...state, layer: clampLayer(action.index, state.config) };
    case 'selectKey':
      return { ...state, ...select(action.index === null ? [] : [action.index]) };
    case 'toggleKey': {
      const { selection } = state;
      const next = selection.includes(action.index) ? selection.filter((i) => i !== action.index) : [...selection, action.index];
      return { ...state, ...select(next) };
    }
    case 'selectKeys':
      return { ...state, ...select(action.additive ? [...state.selection, ...action.indices] : action.indices) };
    case 'selectSensor':
      return { ...state, ...select([]), sensor: action.index };
    case 'setBinding':
      if (state.key === null) return state;
      return commit(state, setBinding(keymap, state.layer, state.key, action.binding));
    case 'placeOnKey': {
      const current = keymap.layers[state.layer]?.bindings[action.index];
      if (!current) return state;
      const next = applyPaletteItem(current, action.item, keymap);
      return commit(state, setBinding(keymap, state.layer, action.index, next), select([action.index]));
    }
    case 'placeOnEncoder': {
      const current = keymap.layers[state.layer]?.sensorBindings?.[action.index] ?? TRANSPARENT;
      const next = applyToEncoder(current, action.item, action.direction);
      if (!next) return { ...state, notice: 'Only keys, Transparent and None can go on an encoder.' };
      return commit(state, setSensorBinding(keymap, state.layer, action.index, next), { ...select([]), sensor: action.index });
    }
    case 'placeOnSelection': {
      if (state.selection.length === 0) return state;
      return commit(state, editKeys(keymap, state.layer, state.selection, (b) => applyPaletteItem(b, action.item, keymap)));
    }
    case 'swapKeys': {
      if (action.from === action.to) return state;
      return commit(state, swapBindings(keymap, state.layer, action.from, action.to), select([action.to]));
    }
    case 'copyKey': {
      const fromLayer = action.fromLayer ?? state.layer;
      if (action.from === action.to && fromLayer === state.layer) return state;
      return commit(state, copyBinding(keymap, state.layer, action.from, action.to, fromLayer), select([action.to]));
    }
    case 'copyKeys':
      if (state.selection.length === 0) return state;
      return { ...state, clipboard: copyKeys(keymap, state.layer, state.selection) };
    case 'cutKeys':
      if (state.selection.length === 0) return state;
      return commit(state, editKeys(keymap, state.layer, state.selection, () => TRANSPARENT), {
        clipboard: copyKeys(keymap, state.layer, state.selection),
      });
    case 'pasteKeys': {
      const clip = state.clipboard;
      if (!clip) return state;
      const next = pasteKeys(keymap, state.layer, clip, state.selection);
      if (next) return commit(state, next, clip.keys.length > 1 ? select(clip.keys.map((k) => k.index)) : {});
      if (clip.keys.length > 1 && clip.layer === state.layer) {
        return { ...state, notice: 'These keys are already on this layer. Switch to another layer to paste them.' };
      }
      if (clip.keys.length === 1 && state.selection.length === 0) return { ...state, notice: 'Select the keys to paste onto.' };
      return state;
    }
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
      // Keep showing the same layer: follow it when it moves, and shift when another
      // layer moves from one side of it to the other.
      const { from, to } = action;
      const layer =
        state.layer === from
          ? to
          : from < state.layer && to >= state.layer
            ? state.layer - 1
            : from > state.layer && to <= state.layer
              ? state.layer + 1
              : state.layer;
      return commit(state, moveLayer(keymap, from, to), { layer });
    }
    case 'deleteLayer': {
      if (keymap.layers.length <= 1) return state;
      const { model, removedCombos } = deleteLayer(keymap, action.index);
      const notice =
        removedCombos.length > 0
          ? `Removed combo${removedCombos.length > 1 ? 's' : ''} ${removedCombos.join(', ')}: ${removedCombos.length > 1 ? 'they' : 'it'} only worked on the deleted layer.`
          : null;
      // Deleting a layer before the shown one shifts it down by one; keep showing it.
      const layer = Math.min(action.index < state.layer ? state.layer - 1 : state.layer, model.layers.length - 1);
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
