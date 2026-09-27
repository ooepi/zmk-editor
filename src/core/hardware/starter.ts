import { emptyKeymap, type KeymapModel } from '../keymap/model.ts';
import type { KeyboardHardware } from './types.ts';

/** Distinct keys, so every switch can be tested after the first flash. */
const STARTER_KEYS = [
  ...'QWERTYUIOPASDFGHJKLZXCVBNM'.split(''),
  'N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8', 'N9', 'N0',
  'SPACE', 'RET', 'BSPC', 'TAB', 'ESC', 'LSHFT', 'LCTRL', 'LALT', 'LGUI',
  'MINUS', 'EQUAL', 'LBKT', 'RBKT', 'SEMI', 'SQT', 'COMMA', 'DOT', 'FSLH', 'BSLH', 'GRAVE',
  'LEFT', 'DOWN', 'UP', 'RIGHT',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
];

/** One layer with a different key on each switch (in keymap order), then `&trans`. */
export function starterKeymap(hw: KeyboardHardware): KeymapModel {
  const bindings = hw.keys.map((_, i) => {
    const code = STARTER_KEYS[i];
    return code ? { behavior: 'kp', params: [code] } : { behavior: 'trans', params: [] };
  });
  return {
    ...emptyKeymap(),
    topLevel: [
      { kind: 'include', path: 'behaviors.dtsi', system: true },
      { kind: 'include', path: 'dt-bindings/zmk/keys.h', system: true },
    ],
    layers: [{ name: 'default_layer', displayName: 'Base', bindings, properties: [] }],
  };
}
