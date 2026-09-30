import type { KeymapModel } from './model.ts';

let nextUid = 1;

/**
 * Gives every layer without one a `uid`: an identity that survives renames and moves, so ZMK
 * Studio sync can tell which layer is which. Returns the same model when nothing was missing.
 * Uids are stored with the config, so new ones always start above any already in the model.
 */
export function withLayerUids(model: KeymapModel): KeymapModel {
  for (const layer of model.layers) if (layer.uid !== undefined && layer.uid >= nextUid) nextUid = layer.uid + 1;
  if (model.layers.every((l) => l.uid !== undefined)) return model;
  return { ...model, layers: model.layers.map((l) => (l.uid === undefined ? { ...l, uid: nextUid++ } : l)) };
}
