import type { KeymapModel } from '../keymap/model.ts';
import type { BehaviorMap, DeviceBehavior } from './behaviors.ts';
import { toDevice, type DeviceBinding, type SendProblem, type TranslateContext } from './translate.ts';

export interface DeviceLayer {
  id: number;
  name: string;
  bindings: DeviceBinding[];
}

/** A keyboard's keymap as ZMK Studio reports it, in layer order. */
export interface DeviceKeymap {
  layers: DeviceLayer[];
  /** How many more layers the keyboard can switch on (its spare `reserved` layers). */
  availableLayers: number;
}

/** One change to send to the keyboard. Indices are the keyboard's layer order at that point. */
export type StudioOp =
  | { kind: 'removeLayer'; index: number; id: number }
  | { kind: 'addLayer'; uid: number }
  | { kind: 'moveLayer'; from: number; to: number }
  | { kind: 'renameLayer'; id: number; name: string }
  | { kind: 'setBinding'; layerId: number; key: number; binding: DeviceBinding };

export interface DesiredLayer {
  uid: number;
  /** The keyboard's id for it, when the keyboard has it. */
  id: number | undefined;
  name: string;
  /** Null where the binding can't be sent (see `problems`). */
  bindings: (DeviceBinding | null)[];
}

export interface Desired {
  layers: DesiredLayer[];
  problems: { uid: number; key: number; reason: SendProblem }[];
}

/** A layer's name as ZMK Studio reports it: its display-name, or "" when it has none. */
export const deviceLayerName = (layer: { displayName?: string | undefined }) => layer.displayName ?? '';

/**
 * A translate context for the editor's keymap, with layers matched to the keyboard's by uid. With
 * `live` (the ids the keyboard has now), a layer whose id is gone counts as not on the keyboard yet.
 */
export function contextFor(
  keymap: KeymapModel,
  uidToId: Map<number, number>,
  device: DeviceBehavior[],
  behaviors: BehaviorMap,
  live?: ReadonlySet<number>,
): TranslateContext {
  const idToIndex = new Map<number, number>();
  keymap.layers.forEach((layer, index) => {
    const id = layer.uid === undefined ? undefined : uidToId.get(layer.uid);
    if (id !== undefined) idToIndex.set(id, index);
  });
  return {
    keymap,
    device: new Map(device.map((b) => [b.id, b])),
    behaviors,
    layerId: (index) => {
      const uid = keymap.layers[index]?.uid;
      const id = uid === undefined ? undefined : uidToId.get(uid);
      return id !== undefined && (!live || live.has(id)) ? id : undefined;
    },
    layerIndex: (id) => idToIndex.get(id),
  };
}

/** What the keyboard should hold for the editor's keymap. */
export function desiredKeymap(
  keymap: KeymapModel,
  uidToId: Map<number, number>,
  device: DeviceBehavior[],
  behaviors: BehaviorMap,
  live?: ReadonlySet<number>,
): Desired {
  const ctx = contextFor(keymap, uidToId, device, behaviors, live);
  const problems: Desired['problems'] = [];
  const layers = keymap.layers.map((layer): DesiredLayer => {
    const uid = layer.uid ?? -1;
    const bindings = layer.bindings.map((binding, key) => {
      const result = toDevice(binding, ctx);
      if ('ok' in result) return result.ok;
      problems.push({ uid, key, reason: result.reason });
      return null;
    });
    return { uid, id: uidToId.get(uid), name: deviceLayerName(layer), bindings };
  });
  return { layers, problems };
}

const same = (a: DeviceBinding | undefined, b: DeviceBinding) =>
  a !== undefined && a.behaviorId === b.behaviorId && a.param1 === b.param1 && a.param2 === b.param2;

/**
 * The changes that take the keyboard (`mirror`) to `desired`, in the order to send them. After an
 * `addLayer` it stops: the new layer's id comes back from the keyboard, and the next pass continues.
 * `refused`: layers (by uid) the keyboard wouldn't add; they wait for a build like when there's no room.
 */
export function reconcile(mirror: DeviceKeymap, desired: Desired, refused: ReadonlySet<number> = new Set()): StudioOp[] {
  const ops: StudioOp[] = [];
  const onKeyboard = new Set(mirror.layers.map((l) => l.id));
  // Each keyboard layer belongs to one editor layer; a second claim (a stale uid) is treated as new.
  const claimed = new Set<number>();
  const wanted = desired.layers.map((l) => {
    const id = l.id !== undefined && onKeyboard.has(l.id) && !claimed.has(l.id) ? l.id : undefined;
    if (id !== undefined) claimed.add(id);
    return { ...l, id };
  });
  const wantedIds = new Set(wanted.flatMap((l) => (l.id === undefined ? [] : [l.id])));

  const sim = [...mirror.layers];
  for (let i = sim.length - 1; i >= 0; i--) {
    const layer = sim[i];
    if (layer && !wantedIds.has(layer.id)) {
      ops.push({ kind: 'removeLayer', index: i, id: layer.id });
      sim.splice(i, 1);
    }
  }

  const missing = wanted.filter((l) => l.id === undefined && !refused.has(l.uid));
  const free = mirror.availableLayers + (mirror.layers.length - sim.length);
  const adds = missing.slice(0, Math.max(0, free));
  if (adds.length > 0) return [...ops, ...adds.map((l): StudioOp => ({ kind: 'addLayer', uid: l.uid }))];

  const order = wanted.flatMap((l) => (l.id === undefined ? [] : [l.id]));
  order.forEach((id, to) => {
    const from = sim.findIndex((l) => l.id === id);
    if (from === to || from < 0) return;
    ops.push({ kind: 'moveLayer', from, to });
    const [moved] = sim.splice(from, 1);
    if (moved) sim.splice(to, 0, moved);
  });

  for (const layer of wanted) {
    const current = layer.id === undefined ? undefined : sim.find((l) => l.id === layer.id);
    if (!current || layer.id === undefined) continue;
    if (current.name !== layer.name) ops.push({ kind: 'renameLayer', id: layer.id, name: layer.name });
    layer.bindings.forEach((binding, key) => {
      if (binding && key < current.bindings.length && !same(current.bindings[key], binding)) {
        ops.push({ kind: 'setBinding', layerId: current.id, key, binding });
      }
    });
  }
  return ops;
}
