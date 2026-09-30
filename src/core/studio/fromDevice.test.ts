import { describe, expect, it } from 'vitest';
import { formatBinding } from '../keymap/bindings.ts';
import { setBinding } from '../keymap/edit.ts';
import { importKeymap } from '../keymap/importer.ts';
import { withLayerUids } from '../keymap/layerIds.ts';
import type { DeviceBehavior } from './behaviors.ts';
import { compareKeymaps } from './compare.ts';
import { configFromDevice, keymapFromDevice } from './fromDevice.ts';
import type { DeviceKeymap } from './reconcile.ts';
import { encodeKey } from './usage.ts';

const device: DeviceBehavior[] = [
  { id: 1, name: 'Key Press', cells: ['keycode', 'none'] },
  { id: 2, name: 'Momentary Layer', cells: ['layer', 'none'] },
  { id: 3, name: 'Transparent', cells: ['none', 'none'] },
  { id: 4, name: 'Home Row Left', cells: ['keycode', 'keycode'] },
];
const kp = (key: string) => ({ behaviorId: 1, param1: encodeKey(key) ?? 0, param2: 0 });
const trans = { behaviorId: 3, param1: 0, param2: 0 };

const keyboard = (): DeviceKeymap => ({
  layers: [
    { id: 0, name: 'Base', bindings: [kp('A'), { behaviorId: 2, param1: 3, param2: 0 }] },
    { id: 3, name: 'Fn', bindings: [{ behaviorId: 4, param1: encodeKey('LSHIFT') ?? 0, param2: encodeKey('F') ?? 0 }, trans] },
  ],
  availableLayers: 2,
});

const editor = () =>
  withLayerUids(
    importKeymap(`/ {
    keymap {
        compatible = "zmk,keymap";
        base { display-name = "Base"; bindings = <&kp A &mo 1>; };
        fn { display-name = "Fn"; bindings = <&kp B &trans>; };
    };
};
`).model,
  );

const texts = (model: { layers: { bindings: Parameters<typeof formatBinding>[0][] }[] }) => model.layers.map((l) => l.bindings.map(formatBinding));

describe('configFromDevice', () => {
  it('builds a Studio-only config from the keyboard, inventing behaviors it does not know', () => {
    const layout = { name: 'Default', keys: [0, 1].map((i) => ({ x: i * 100, y: 0, w: 100, h: 100, r: 0, rx: 0, ry: 0 })) };
    const { config, uidToId } = configFromDevice('My Board', keyboard(), layout, device);
    expect(config.studio).toEqual({ device: 'My Board' });
    expect(config.keyboard).toBe('my_board');
    expect(config.layout).toEqual(layout);
    expect(config.keymap.layers.map((l) => l.displayName)).toEqual(['Base', 'Fn']);
    expect(texts(config.keymap)).toEqual([
      ['&kp A', '&mo 1'],
      ['&home_row_left LSHFT F', '&trans'],
    ]);
    expect(config.keymap.behaviors.map((b) => b.label)).toEqual(['home_row_left']);
    expect([...uidToId.values()]).toEqual([0, 3]);
  });
});

describe('keymapFromDevice', () => {
  it('brings the keyboard keymap into an existing config, keeping keys it cannot read', () => {
    const { keymap, unreadable } = keymapFromDevice(editor(), keyboard(), device, { invent: false });
    expect(texts(keymap)).toEqual([
      ['&kp A', '&mo 1'],
      ['&kp B', '&trans'],
    ]);
    expect(unreadable).toBe(1);
    expect(keymap.behaviors).toEqual([]);
  });
});

describe('compareKeymaps', () => {
  it('finds the keys that differ, layer by layer in order', () => {
    const board: DeviceKeymap = {
      layers: [...keyboard().layers.slice(0, 1), { id: 3, name: 'Fn', bindings: [kp('C'), trans] }],
      availableLayers: 2,
    };
    const result = compareKeymaps(editor(), board, device);
    expect(result.keyCountMatches).toBe(true);
    expect(result.keys).toEqual([{ layer: 1, key: 0, editor: '&kp B', keyboard: '&kp C' }]);
    expect(result.summary).toBe('1 key on 1 layer');
  });

  it('counts layer name and count differences, and says when the keyboards do not match', () => {
    const renamed = { ...editor(), layers: editor().layers.map((l, i) => (i === 1 ? { ...l, displayName: 'Func' } : l)) };
    const board: DeviceKeymap = {
      layers: [
        { id: 0, name: 'Base', bindings: [kp('A'), { behaviorId: 2, param1: 3, param2: 0 }] },
        { id: 3, name: 'Fn', bindings: [kp('B'), trans] },
      ],
      availableLayers: 2,
    };
    const renamedResult = compareKeymaps(renamed, board, device);
    expect(renamedResult.layers).toBe(1);
    expect(renamedResult.summary).toBe('1 layer name');
    expect(compareKeymaps(editor(), board, device).summary).toBe('');
    const bigger = setBinding(editor(), 0, 0, { behavior: 'kp', params: ['A'] });
    const other: DeviceKeymap = { layers: [{ id: 0, name: 'Base', bindings: [kp('A')] }], availableLayers: 0 };
    expect(compareKeymaps(bigger, other, device).keyCountMatches).toBe(false);
  });
});

describe('unnamed layers', () => {
  const plain = () =>
    withLayerUids(
      importKeymap(`/ {
    keymap {
        compatible = "zmk,keymap";
        base { bindings = <&kp A &mo 1>; };
        fn { bindings = <&kp B &trans>; };
    };
};
`).model,
    );
  const board = (): DeviceKeymap => ({
    layers: [
      { id: 0, name: '', bindings: [kp('A'), { behaviorId: 2, param1: 3, param2: 0 }] },
      { id: 3, name: '', bindings: [kp('B'), trans] },
    ],
    availableLayers: 0,
  });

  it('match a keyboard that reports no names (ZMK sends "" without display-name)', () => {
    expect(compareKeymaps(plain(), board(), device).summary).toBe('');
  });

  it('keep the keymap without display-names when read back', () => {
    const { keymap } = keymapFromDevice(plain(), board(), device, { invent: false });
    expect(keymap.layers.map((l) => [l.name, l.displayName])).toEqual([
      ['base', undefined],
      ['fn', undefined],
    ]);
  });
});
