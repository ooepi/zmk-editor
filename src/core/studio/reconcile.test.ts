import { describe, expect, it } from 'vitest';
import { addLayer, deleteLayer, moveLayer, renameLayer, setBinding } from '../keymap/edit.ts';
import { importKeymap } from '../keymap/importer.ts';
import { withLayerUids } from '../keymap/layerIds.ts';
import type { KeymapModel } from '../keymap/model.ts';
import { resolveBehaviors, type DeviceBehavior } from './behaviors.ts';
import { desiredKeymap, reconcile, type DeviceKeymap, type StudioOp } from './reconcile.ts';
import { encodeKey } from './usage.ts';

const device: DeviceBehavior[] = [
  { id: 1, name: 'Key Press', cells: ['keycode', 'none'] },
  { id: 2, name: 'Momentary Layer', cells: ['layer', 'none'] },
  { id: 3, name: 'Transparent', cells: ['none', 'none'] },
];

const start = withLayerUids(
  importKeymap(`/ {
    keymap {
        compatible = "zmk,keymap";
        base { display-name = "Base"; bindings = <&kp A &mo 1>; };
        nav { display-name = "Nav"; bindings = <&trans &trans>; };
    };
};
`).model,
);

const kp = (key: string) => ({ behaviorId: 1, param1: encodeKey(key) ?? 0, param2: 0 });
const trans = { behaviorId: 3, param1: 0, param2: 0 };

/** The keyboard in sync with `start`: layer ids 0 and 1, one free layer. */
const mirror = (): DeviceKeymap => ({
  layers: [
    { id: 0, name: 'Base', bindings: [kp('A'), { behaviorId: 2, param1: 1, param2: 0 }] },
    { id: 1, name: 'Nav', bindings: [trans, trans] },
  ],
  availableLayers: 1,
});

const uidToId = (model: KeymapModel = start) => new Map(model.layers.slice(0, 2).map((l, i) => [l.uid ?? -1, i]));
const ops = (keymap: KeymapModel, ids = uidToId(), on: DeviceKeymap = mirror()): StudioOp[] =>
  reconcile(on, desiredKeymap(keymap, ids, device, resolveBehaviors(device, keymap)));

describe('reconcile', () => {
  it('has nothing to do when the keyboard matches', () => {
    expect(ops(start)).toEqual([]);
  });

  it('sets a changed key', () => {
    expect(ops(setBinding(start, 1, 0, { behavior: 'kp', params: ['B'] }))).toEqual([
      { kind: 'setBinding', layerId: 1, key: 0, binding: kp('B') },
    ]);
  });

  it('renames a layer', () => {
    expect(ops(renameLayer(start, 1, 'Navigation'))).toEqual([{ kind: 'renameLayer', id: 1, name: 'Navigation' }]);
  });

  it('moves a layer; layer params follow the ids, so no key changes', () => {
    // moveLayer renumbers &mo 1 → &mo 0, which is still keyboard layer id 1.
    expect(ops(moveLayer(start, 1, 0))).toEqual([{ kind: 'moveLayer', from: 1, to: 0 }]);
  });

  it('removes a deleted layer', () => {
    // Deleting nav turns base's &mo 1 into &none, which this keyboard doesn't have: that key waits for a build.
    const { model } = deleteLayer(start, 1);
    expect(ops(model)).toEqual([{ kind: 'removeLayer', index: 1, id: 1 }]);
  });

  it('adds a new layer when the keyboard has a free one, then stops until it knows its id', () => {
    const added = withLayerUids(addLayer(start, 'Sym'));
    const uid = added.layers[2]?.uid ?? -1;
    expect(ops(added)).toEqual([{ kind: 'addLayer', uid }]);
    expect(ops(added, uidToId(), { ...mirror(), availableLayers: 0 })).toEqual([]);
  });

  it('once the new layer has an id, names it and sends its keys', () => {
    const added = withLayerUids(setBinding(withLayerUids(addLayer(start, 'Sym')), 2, 0, { behavior: 'kp', params: ['C'] }));
    const ids = uidToId();
    ids.set(added.layers[2]?.uid ?? -1, 7);
    const on = mirror();
    on.layers.push({ id: 7, name: '', bindings: [trans, trans] });
    expect(ops(added, ids, on)).toEqual([
      { kind: 'renameLayer', id: 7, name: 'Sym' },
      { kind: 'setBinding', layerId: 7, key: 0, binding: kp('C') },
    ]);
  });
});

describe('desiredKeymap', () => {
  it('lists keys the keyboard cannot take, and why', () => {
    const changed = setBinding(start, 0, 0, { behavior: 'caps_word', params: [] });
    const desired = desiredKeymap(changed, uidToId(), device, resolveBehaviors(device, changed));
    expect(desired.problems).toEqual([{ uid: start.layers[0]?.uid, key: 0, reason: 'not-on-keyboard' }]);
    expect(desired.layers[0]?.bindings[0]).toBeNull();
  });
});
