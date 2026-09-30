import { describe, expect, it } from 'vitest';
import { importKeymap } from '../keymap/importer.ts';
import type { Binding } from '../keymap/model.ts';
import { resolveBehaviors, type DeviceBehavior } from './behaviors.ts';
import { fromDevice, toDevice, type TranslateContext } from './translate.ts';
import { encodeKey } from './usage.ts';

const keymap = importKeymap(`#define NAV 1
/ {
    behaviors {
        hml: homerow_mods {
            compatible = "zmk,behavior-hold-tap";
            #binding-cells = <2>;
            bindings = <&kp>, <&kp>;
        };
    };
    keymap {
        compatible = "zmk,keymap";
        base { bindings = <&kp A>; };
        nav { bindings = <&trans>; };
        sym { bindings = <&trans>; };
    };
};
`).model;

const device: DeviceBehavior[] = [
  { id: 10, name: 'Key Press', cells: ['keycode', 'none'] },
  { id: 11, name: 'Momentary Layer', cells: ['layer', 'none'] },
  { id: 12, name: 'Layer-Tap', cells: ['layer', 'keycode'] },
  { id: 13, name: 'Bluetooth', cells: ['number', 'number'] },
  { id: 14, name: 'Transparent', cells: ['none', 'none'] },
  { id: 15, name: 'homerow_mods', cells: ['keycode', 'keycode'] },
  { id: 16, name: 'Mouse Key Press', cells: ['number', 'none'] },
  { id: 17, name: 'Home Row Left', cells: ['keycode', 'keycode'] },
];

/** Layer ids on the keyboard: base 0, nav 5; sym isn't on the keyboard yet. */
const ctx: TranslateContext = {
  keymap,
  device: new Map(device.map((b) => [b.id, b])),
  behaviors: resolveBehaviors(device, keymap),
  layerId: (index) => [0, 5][index],
  layerIndex: (id) => ({ 0: 0, 5: 1 })[id],
};

const b = (behavior: string, ...params: string[]): Binding => ({ behavior, params });
const A = encodeKey('A') ?? 0;
const LSHIFT = encodeKey('LSHIFT') ?? 0;

describe('toDevice', () => {
  it('sends keycodes, layers, enums and plain behaviors as numbers', () => {
    expect(toDevice(b('kp', 'A'), ctx)).toEqual({ ok: { behaviorId: 10, param1: A, param2: 0 } });
    expect(toDevice(b('mo', 'NAV'), ctx)).toEqual({ ok: { behaviorId: 11, param1: 5, param2: 0 } });
    expect(toDevice(b('lt', '1', 'A'), ctx)).toEqual({ ok: { behaviorId: 12, param1: 5, param2: A } });
    expect(toDevice(b('bt', 'BT_SEL', '2'), ctx)).toEqual({ ok: { behaviorId: 13, param1: 3, param2: 2 } });
    expect(toDevice(b('bt', 'BT_CLR'), ctx)).toEqual({ ok: { behaviorId: 13, param1: 0, param2: 0 } });
    expect(toDevice(b('mkp', 'MB2'), ctx)).toEqual({ ok: { behaviorId: 16, param1: 2, param2: 0 } });
    expect(toDevice(b('trans'), ctx)).toEqual({ ok: { behaviorId: 14, param1: 0, param2: 0 } });
    expect(toDevice(b('hml', 'LSHIFT', 'A'), ctx)).toEqual({ ok: { behaviorId: 15, param1: LSHIFT, param2: A } });
  });

  it('says why a binding cannot be sent', () => {
    expect(toDevice(b('caps_word'), ctx)).toEqual({ reason: 'not-on-keyboard' });
    expect(toDevice(b('mo', '2'), ctx)).toEqual({ reason: 'pending-layer' });
    expect(toDevice(b('mo', '9'), ctx)).toEqual({ reason: 'untranslatable' });
    expect(toDevice(b('kp', 'HRML(A)'), ctx)).toEqual({ reason: 'untranslatable' });
    expect(toDevice(b('bt', 'NOPE'), ctx)).toEqual({ reason: 'untranslatable' });
  });
});

describe('fromDevice', () => {
  it('turns device bindings back into keymap bindings', () => {
    expect(fromDevice({ behaviorId: 10, param1: A, param2: 0 }, ctx)).toEqual({ ok: b('kp', 'A') });
    expect(fromDevice({ behaviorId: 12, param1: 5, param2: A }, ctx)).toEqual({ ok: b('lt', '1', 'A') });
    expect(fromDevice({ behaviorId: 13, param1: 3, param2: 2 }, ctx)).toEqual({ ok: b('bt', 'BT_SEL', '2') });
    expect(fromDevice({ behaviorId: 14, param1: 0, param2: 0 }, ctx)).toEqual({ ok: b('trans') });
    expect(fromDevice({ behaviorId: 15, param1: LSHIFT, param2: A }, ctx)).toEqual({ ok: b('hml', 'LSHFT', 'A') });
    expect(fromDevice({ behaviorId: 17, param1: LSHIFT, param2: A }, ctx)).toEqual({ ok: b('home_row_left', 'LSHFT', 'A') });
  });

  it('says why a device binding cannot be read', () => {
    expect(fromDevice({ behaviorId: 99, param1: 0, param2: 0 }, ctx)).toEqual({ reason: 'unknown-behavior' });
    expect(fromDevice({ behaviorId: 11, param1: 42, param2: 0 }, ctx)).toEqual({ reason: 'untranslatable' });
    expect(fromDevice({ behaviorId: 10, param1: 0x07ffff, param2: 0 }, ctx)).toEqual({ reason: 'untranslatable' });
  });
});
