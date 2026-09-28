import { formatBinding } from './bindings.ts';
import { setBinding } from './edit.ts';
import type { Binding, KeymapModel } from './model.ts';

/** Copied keys: their bindings, positions and the layer they came from. */
export interface KeyClipboard {
  layer: number;
  keys: { index: number; binding: Binding }[];
}

export function copyKeys(model: KeymapModel, layer: number, indices: number[]): KeyClipboard {
  const bindings = model.layers[layer]?.bindings ?? [];
  const keys = [...new Set(indices)]
    .sort((a, b) => a - b)
    .flatMap((index) => {
      const binding = bindings[index];
      return binding ? [{ index, binding }] : [];
    });
  return { layer, keys };
}

/**
 * Pastes onto a layer. One copied key goes onto every selected key; several go
 * into the positions they were copied from. Null when nothing would change.
 */
export function pasteKeys(model: KeymapModel, layer: number, clip: KeyClipboard, selection: number[]): KeymapModel | null {
  const bindings = model.layers[layer]?.bindings;
  if (!bindings) return null;
  const [single] = clip.keys;
  const writes = clip.keys.length === 1 && single ? selection.map((index) => ({ index, binding: single.binding })) : clip.keys;
  let next = model;
  for (const { index, binding } of writes) {
    const current = bindings[index];
    if (current && formatBinding(current) !== formatBinding(binding)) next = setBinding(next, layer, index, binding);
  }
  return next === model ? null : next;
}
