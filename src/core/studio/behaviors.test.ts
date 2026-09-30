import { describe, expect, it } from 'vitest';
import { importKeymap } from '../keymap/importer.ts';
import { cellKinds, resolveBehaviors, type DeviceBehavior } from './behaviors.ts';

const keymap = importKeymap(`/ {
    behaviors {
        hml: homerow_mods {
            compatible = "zmk,behavior-hold-tap";
            #binding-cells = <2>;
            bindings = <&kp>, <&kp>;
        };
        td: tap_dance_0 {
            compatible = "zmk,behavior-tap-dance";
            display-name = "Shift Dance";
            #binding-cells = <0>;
            bindings = <&kp LSHIFT>, <&caps_word>;
        };
    };
    keymap {
        compatible = "zmk,keymap";
        base { bindings = <&kp A>; };
    };
};
`).model;

const behavior = (id: number, name: string): DeviceBehavior => ({ id, name, cells: ['none', 'none'] });

describe('cellKinds', () => {
  it('reads each param cell from the metadata sets', () => {
    expect(cellKinds([{ param1: [{ name: 'Key', hidUsage: { keyboardMax: 0, consumerMax: 0 } }], param2: [] }])).toEqual(['keycode', 'none']);
    expect(cellKinds([{ param1: [{ name: 'Layer', layerId: {} }], param2: [{ name: 'Key', hidUsage: { keyboardMax: 0, consumerMax: 0 } }] }])).toEqual([
      'layer',
      'keycode',
    ]);
    expect(
      cellKinds([
        { param1: [{ name: 'Select', constant: 3 }], param2: [{ name: 'Profile', range: { min: 0, max: 4 } }] },
        { param1: [{ name: 'Clear', constant: 0 }], param2: [{ name: '', nil: {} }] },
      ]),
    ).toEqual(['number', 'number']);
    expect(cellKinds([])).toEqual(['none', 'none']);
  });
});

describe('resolveBehaviors', () => {
  it('matches built-ins by their ZMK display name', () => {
    const map = resolveBehaviors([behavior(7, 'Key Press'), behavior(8, 'Layer-Tap'), behavior(9, 'mouse_move')], keymap);
    expect(map.refById.get(7)).toBe('kp');
    expect(map.refById.get(8)).toBe('lt');
    expect(map.refById.get(9)).toBe('mmv');
    expect(map.idByRef.get('kp')).toBe(7);
  });

  it('matches your own behaviors by display-name, or node name when there is none', () => {
    const map = resolveBehaviors([behavior(1, 'homerow_mods'), behavior(2, 'Shift Dance')], keymap);
    expect(map.refById.get(1)).toBe('hml');
    expect(map.refById.get(2)).toBe('td');
  });

  it('gives behaviors it cannot match a unique made-up ref', () => {
    const map = resolveBehaviors([behavior(3, 'Home Row Left'), behavior(4, 'Key Press'), behavior(5, 'kp')], keymap);
    expect(map.refById.get(3)).toBe('home_row_left');
    expect(map.refById.get(5)).toBe('kp_2');
    expect(map.unknown.map((b) => b.id)).toEqual([3, 5]);
  });
});
