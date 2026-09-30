import { describe, expect, it } from 'vitest';
import { setDisplay } from './displays.ts';
import { generateShield } from './generate.ts';
import { DEFAULT_BASICS, gridHardware } from './grid.ts';
import { testPad } from './testFixtures.ts';
import type { KeyboardHardware } from './types.ts';

/**
 * Every file generated for Pro Micro designs, locked in before the interconnect
 * refactor: designs people already have must keep generating the same shield.
 */
const proMicroSplit: KeyboardHardware = {
  ...setDisplay(
    setDisplay(
      gridHardware({
        ...DEFAULT_BASICS,
        name: 'golden_split',
        displayName: 'Golden Split',
        rows: 2,
        cols: 3,
        diodeDirection: 'row2col',
      }),
      'left',
      'oled_128x32',
    ),
    'right',
    'oled_128x64',
  ),
  wiring: {
    kind: 'matrix',
    diodeDirection: 'row2col',
    rows: [4, 5],
    cols: [6, 7, 8],
    right: { rows: [9, 10], cols: [14, 15, 16] },
  },
  encoders: [{ a: 18, b: 19 }],
  rightEncoders: [{ a: 20, b: 21 }],
};

const proMicroPad: KeyboardHardware = { ...setDisplay(testPad, undefined, 'nice_view'), encoders: [{ a: 8, b: 9 }] };

describe('Pro Micro shields (golden)', () => {
  it('generates the same split with encoders and OLEDs', () => {
    expect(generateShield(proMicroSplit)).toMatchSnapshot();
  });

  it('generates the same one-piece direct-wired pad with a nice!view', () => {
    expect(generateShield(proMicroPad)).toMatchSnapshot();
  });
});
