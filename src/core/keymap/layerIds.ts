import type { KeymapModel } from './model.ts';

let nextUid = 1;

/**
 * Gives every layer without one a `uid`: an identity that survives renames and moves, so ZMK
 * Studio sync can tell which layer is which. Returns the same model when nothing was missing.
 */
export function withLayerUids(model: KeymapModel): KeymapModel {
  if (model.layers.every((l) => l.uid !== undefined)) return model;
  return { ...model, layers: model.layers.map((l) => (l.uid === undefined ? { ...l, uid: nextUid++ } : l)) };
}
