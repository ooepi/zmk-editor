import { formatBinding } from '../keymap/bindings.ts';
import type { KeymapModel } from '../keymap/model.ts';
import { resolveBehaviors, type DeviceBehavior } from './behaviors.ts';
import { contextFor, deviceLayerName, type DeviceKeymap } from './reconcile.ts';
import { fromDevice, toDevice } from './translate.ts';

export interface KeyDifference {
  layer: number;
  key: number;
  /** The binding as the keymap writes it, e.g. `&kp A`; `?` when the keyboard's can't be read. */
  editor: string;
  keyboard: string;
}

export interface Comparison {
  /** Every keyboard layer has as many keys as the editor's keymap: they're the same keyboard. */
  keyCountMatches: boolean;
  keys: KeyDifference[];
  /** Layers whose names differ, plus layers only one side has. */
  layers: number;
  /** "7 keys on 2 layers, 1 layer name"; empty when they match. */
  summary: string;
  /** The layers matched by position: each editor layer's uid → the keyboard's layer id. */
  uidToId: Map<number, number>;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Compares the editor's keymap with the keyboard's, layer by layer in order. Keys the editor can't
 * send to the keyboard don't count: there's no telling whether they match.
 */
export function compareKeymaps(keymap: KeymapModel, device: DeviceKeymap, behaviors: DeviceBehavior[]): Comparison {
  const keyCount = keymap.layers[0]?.bindings.length ?? 0;
  const keyCountMatches = device.layers.every((l) => l.bindings.length === keyCount);
  const uidToId = new Map<number, number>();
  keymap.layers.forEach((layer, i) => {
    const id = device.layers[i]?.id;
    if (layer.uid !== undefined && id !== undefined) uidToId.set(layer.uid, id);
  });
  const resolved = resolveBehaviors(behaviors, keymap);
  const ctx = contextFor(keymap, uidToId, behaviors, resolved);

  const keys: KeyDifference[] = [];
  let names = 0;
  const shared = Math.min(keymap.layers.length, device.layers.length);
  for (let i = 0; i < shared; i++) {
    const layer = keymap.layers[i];
    const deviceLayer = device.layers[i];
    if (!layer || !deviceLayer) continue;
    if (deviceLayerName(layer) !== deviceLayer.name) names++;
    layer.bindings.forEach((binding, key) => {
      const theirs = deviceLayer.bindings[key];
      const ours = toDevice(binding, ctx);
      if (!theirs || !('ok' in ours)) return;
      if (ours.ok.behaviorId === theirs.behaviorId && ours.ok.param1 === theirs.param1 && ours.ok.param2 === theirs.param2) return;
      const read = fromDevice(theirs, ctx);
      keys.push({ layer: i, key, editor: formatBinding(binding), keyboard: 'ok' in read ? formatBinding(read.ok) : '?' });
    });
  }
  const extra = device.layers.length - keymap.layers.length;
  const parts: string[] = [];
  if (keys.length > 0) parts.push(`${plural(keys.length, 'key')} on ${plural(new Set(keys.map((k) => k.layer)).size, 'layer')}`);
  if (names > 0) parts.push(plural(names, 'layer name'));
  if (extra > 0) parts.push(`${plural(extra, 'more layer')} on the keyboard`);
  if (extra < 0) parts.push(`${plural(-extra, 'more layer')} in your config`);
  return { keyCountMatches, keys, layers: names + Math.abs(extra), summary: parts.join(', '), uidToId };
}
